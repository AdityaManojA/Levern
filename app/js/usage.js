// Anonymous screen-usage counts, so the owner can see which screens people use and for how long
// (privacy.html → "Usage counts"). No account id, name, email or quest content is ever recorded:
// only screen names, active seconds, how far down each screen people scrolled, and how often each
// built-in button (data-act) was tapped.
//
// Firestore writes are kept to a minimum: the counts build up on this device, one bucket per day,
// and a finished day is sent once, as a single new document, the next time the app opens. That is
// at most one write per device per day the app was used, and nothing is ever updated or re-sent.
//
//   levernUsage/{random id}   { day: 'YYYY-MM-DD', dev: 'phone'|'desktop', v: { screen: [visits, seconds, scroll%] }, a: { act: taps }, at }
import { FIRESTORE_COLLECTIONS, STORAGE_KEYS } from './constants.js';

export const IDLE_MS = 2 * 60 * 1000;   // no touch, key or scroll for this long: stop counting time
const KEEP_DAYS = 7;                     // unsent days older than this are dropped, never sent
const MAX_VIEWS = 20, MAX_ACTS = 60;     // also capped by the database rules
const NAME = /^[a-z0-9_-]{1,30}$/;
const SKIP = new Set(['usage']);         // the owner's own report is not counted

/* ---------- pure helpers (tested in app/tests/usage.test.js) ---------- */
export const dayKey = (t = Date.now()) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const bucket = (data, day) => (data[day] ||= { v: {}, a: {} });

// a screen was opened
export function addVisit(data, day, view) {
  if (!NAME.test(view) || SKIP.has(view)) return;
  const b = bucket(data, day);
  if (!b.v[view] && Object.keys(b.v).length >= MAX_VIEWS) return;
  (b.v[view] ||= [0, 0, 0])[0]++;
}
// active time on a screen, in milliseconds (stored as whole seconds; the remainder is kept for the next tick)
export function addTime(data, day, view, ms) {
  if (!NAME.test(view) || SKIP.has(view) || !(ms > 0)) return;
  const b = bucket(data, day);
  if (!b.v[view] && Object.keys(b.v).length >= MAX_VIEWS) return;
  const row = (b.v[view] ||= [0, 0, 0]);
  b.ms = (b.ms || 0) + ms;
  const whole = Math.floor(b.ms / 1000);
  row[1] += whole; b.ms -= whole * 1000;
}
// how far down a screen someone got on one visit (0–100), summed so the report can average it
export function addDepth(data, day, view, pct) {
  if (!NAME.test(view) || SKIP.has(view)) return;
  const row = bucket(data, day).v[view];
  if (row) row[2] += Math.max(0, Math.min(100, Math.round(pct)));
}
export function addTap(data, day, act) {
  if (!NAME.test(act) || act.startsWith('usage-')) return;
  const b = bucket(data, day);
  if (!b.a[act] && Object.keys(b.a).length >= MAX_ACTS) return;
  b.a[act] = (b.a[act] || 0) + 1;
}
// active time between two moments: only while visible, and never more than IDLE_MS after the last input
export function activeMs(lastTick, now, lastInput, visible) {
  if (!visible) return 0;
  return Math.max(0, Math.min(now, lastInput + IDLE_MS) - lastTick);
}
// finished days ready to send (oldest first), and days too old to keep
export function readyDays(data, today) {
  const cutoff = dayKey(new Date(today + 'T12:00:00').getTime() - KEEP_DAYS * 864e5);
  const days = Object.keys(data).sort();
  return {
    send: days.filter(d => d < today && d >= cutoff && Object.keys(data[d].v).length),
    drop: days.filter(d => d < today && (d < cutoff || !Object.keys(data[d].v).length)),
  };
}
// what goes in the database for one day
export const docFor = (day, b, dev) => ({ day, dev, v: b.v, a: b.a });

/* ---------- this device's buffer ---------- */
const load = () => { try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.USAGE)) || {}; } catch (e) { return {}; } };
const save = d => { try { localStorage.setItem(STORAGE_KEYS.USAGE, JSON.stringify(d)); } catch (e) {} };

let data = {}, view = null, lastTick = 0, lastInput = 0, depth = 0, started = false, sending = false, account = null;
const visible = () => !document.hidden;

function tick() {
  const now = Date.now();
  if (view) addTime(data, dayKey(now), view, activeMs(lastTick, now, lastInput, visible()));
  lastTick = now;
}
function measureDepth() {
  const el = document.documentElement, h = el.scrollHeight;
  const pct = h <= innerHeight ? 100 : (scrollY + innerHeight) / h * 100;
  if (pct > depth) depth = pct;
}
function endVisit() {
  if (!view) return;
  tick();
  addDepth(data, dayKey(), view, depth);
  save(data);
}

// main.js calls this on every screen change
export function trackView(name) {
  if (!started || name === view) return;
  endVisit();
  view = name; depth = 0; lastInput = lastTick = Date.now();
  addVisit(data, dayKey(), name);
  save(data);
  requestAnimationFrame(measureDepth);
}

async function flush() {
  if (sending || !account?.user() || navigator.onLine === false) return;
  const { send, drop } = readyDays(data, dayKey());
  drop.forEach(d => delete data[d]);
  if (drop.length) save(data);
  if (!send.length) return;
  sending = true;
  try {
    const { db, F } = await account.database();
    if (!(await account.firebaseUser())) return;
    const dev = matchMedia('(max-width: 899px)').matches ? 'phone' : 'desktop';
    const batch = F.writeBatch(db), col = F.collection(db, FIRESTORE_COLLECTIONS.USAGE);
    send.forEach(d => batch.set(F.doc(col), { ...docFor(d, data[d], dev), at: F.serverTimestamp() }));
    await batch.commit();
    send.forEach(d => delete data[d]);
    save(data);
  } catch (e) {
    // try again next time the app opens; nothing is lost until the day is a week old
  } finally { sending = false; }
}

export function startUsage(acct) {
  if (started || typeof document === 'undefined') return;
  started = true; account = acct;
  data = load();
  lastInput = lastTick = Date.now();
  const input = () => { if (Date.now() - lastInput > IDLE_MS) lastTick = Date.now(); tick(); lastInput = Date.now(); };
  ['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach(t => addEventListener(t, input, { passive: true, capture: true }));
  addEventListener('scroll', () => { input(); measureDepth(); }, { passive: true, capture: true });
  document.addEventListener('click', e => {
    const act = e.target.closest?.('[data-act]')?.dataset.act;
    if (act) { addTap(data, dayKey(), act); save(data); }
  }, true);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { tick(); save(data); }
    else { lastInput = lastTick = Date.now(); flush(); }
  });
  addEventListener('pagehide', () => { tick(); save(data); });
  setInterval(() => { tick(); save(data); }, 15000);
  acct.onAccount(u => { if (u) flush(); });
  setTimeout(flush, 5000);   // after start-up, out of the way of the account sync
}
