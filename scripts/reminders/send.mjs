// Levern reminder job. Runs every 5 minutes from .github/workflows/reminders.yml.
//
// For each person who turned on notifications on a device (taskflowUsers/{uid}/push/sub), it works out what
// is due now and sends a web push. Nothing is sent twice: what was sent is recorded in taskflowUsers/{uid}/push/state.
//
// Reads quests and settings from the same encoded chunks the app saves (see app/js/cloud.js), so it needs
// a service account. Needs these environment variables:
//   FIREBASE_SERVICE_ACCOUNT  the service account JSON (a GitHub secret)
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT  (GitHub secrets / variables)
import { inflateRawSync } from 'node:zlib';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import webpush from 'web-push';
import { usesAlerts, alertsOf, alertLabel } from '../../app/js/alerts.js';

const WINDOW_MIN = 5;                        // the job runs every 5 minutes
// GitHub often runs scheduled jobs late, so a quest reminder is still sent up to an hour after its moment.
// Each reminder is recorded once it is sent (the sent keys), so a later run never sends it twice.
const CATCHUP_MIN = 60;
// deadline reminders, in minutes before the deadline, by priority (tier 0 = P1). Adjust to taste.
export const LEADS = { 0: [20, 15, 10, 5], 1: [15, 10, 5], 2: [10, 5], 3: [5], 4: [], 5: [] };
const KEEP = 600;                            // how many sent-keys to remember per person

// ---- pure helpers (exported for tests) -------------------------------------------------------------

// local date and time of day (HH:MM) for a moment, in the person's time zone
export function localParts(ms, tz = 'UTC') {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const p = Object.fromEntries(f.formatToParts(new Date(ms)).map(x => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hm: `${p.hour}:${p.minute}`, minutes: +p.hour * 60 + +p.minute };
}
export const toMinutes = hm => { const [h, m] = String(hm).split(':').map(Number); return h * 60 + m; };
// is the time-of-day `hm` within the last WINDOW_MIN minutes (so each slot is handled by exactly one run)?
export function inWindow(nowMinutes, hm) {
  const d = (nowMinutes - toMinutes(hm) + 1440) % 1440;
  return d < WINDOW_MIN;
}
export const addDaysStr = (s, n) => { const d = new Date(s + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

// the same default nudges the app uses (app/js/nudges.js)
export const NUDGE_DEFAULTS = {
  daily: { label: "Today's quests", defaults: ['09:00'], on: true },
  water: { label: 'Drink water', defaults: ['10:00', '12:00', '14:00', '16:00', '18:00'], on: false },
  eat: { label: 'Eat something', defaults: ['08:30', '13:00', '20:00'], on: false },
  walk: { label: 'Take a walk', defaults: ['11:00', '16:00'], on: false },
};
export function nudgeList(settings) {
  const s = settings?.nudges || {};
  return Object.entries(NUDGE_DEFAULTS).map(([k, d]) => ({
    kind: k, label: d.label,
    on: s[k]?.on ?? d.on,
    times: (s[k]?.times?.length ? s[k].times : d.defaults).slice().sort(),
  }));
}

// the messages due right now for one person. Returns [{ key, title, body, url }]
export function dueNow({ quests = [], settings = {}, tz = 'UTC', now = Date.now() }) {
  const lp = localParts(now, tz), out = [];
  const open = quests.filter(q => !q.done);

  // 1. quest reminders at their exact moment (a reminder that came due in the last window)
  for (const q of open) {
    if (!usesAlerts(q) && q.remind && q.remind.at && q.remind.at <= now && q.remind.at > now - CATCHUP_MIN * 60000) {
      out.push({ key: `rem-${q.id}-${q.remind.at}`, title: `Reminder: ${q.title}`, body: q.due ? `Due ${q.due}${q.time ? ` at ${q.time}` : ''}` : 'Time for this one', url: `#/quest/${encodeURIComponent(q.id)}`, tier: q.tier ?? 3 });
    }
  }

  // 2. deadlines: upcoming within the next hour, due now, and overdue (once a day, at 9:00)
  for (const q of open) {
    if (!q.due) continue;
    if (usesAlerts(q)) {
      // the quest's own reminders: each one goes off at its moment (0 = the due time)
      const tier = q.tier ?? 3;
      for (const a of alertsOf(q)) {
        const diff = a.minutes - lp.minutes;
        if (a.date !== lp.date || diff > 0 || diff <= -CATCHUP_MIN) continue;
        const link = `#/quest/${encodeURIComponent(q.id)}`;
        if (a.m === 0) out.push({ key: `now-${q.id}-${q.due}-${q.time}`, title: `Due now: ${q.title}`, body: `It was due at ${q.time || '09:00'}`, url: link, tier });
        else out.push({ key: `alert-${q.id}-${q.due}-${q.time}-${a.m}`, title: `Reminder: ${q.title}`, body: `Due at ${q.time || '09:00'} · ${alertLabel(a.m).toLowerCase()}`, url: link, tier });
      }
    } else if (q.due === lp.date && q.time) {
      const t = toMinutes(q.time), diff = t - lp.minutes;
      const tier = q.tier ?? 3;
      for (const lead of LEADS[tier] || []) {
        if (diff > lead - WINDOW_MIN && diff <= lead) out.push({ key: `lead-${q.id}-${q.due}-${q.time}-${lead}`, title: `Due in ${lead} min: ${q.title}`, body: `P${tier + 1} · due at ${q.time}`, url: `#/quest/${encodeURIComponent(q.id)}`, tier });
      }
      if (diff <= 0 && diff > -CATCHUP_MIN) out.push({ key: `now-${q.id}-${q.due}-${q.time}`, title: `Due now: ${q.title}`, body: `It was due at ${q.time}`, url: `#/quest/${encodeURIComponent(q.id)}`, tier: q.tier ?? 3 });
    }
    if (q.due === lp.date && !q.time && !usesAlerts(q) && inWindow(lp.minutes, '09:00')) {
      out.push({ key: `today-${q.id}-${q.due}`, title: `Due today: ${q.title}`, body: 'Finish it, or move its date', url: `#/quest/${encodeURIComponent(q.id)}`, tier: q.tier ?? 3 });
    }
    if (q.due < lp.date && inWindow(lp.minutes, '09:00')) {
      out.push({ key: `overdue-${q.id}-${lp.date}`, title: `Overdue: ${q.title}`, body: `Was due ${q.due}`, url: `#/quest/${encodeURIComponent(q.id)}`, tier: q.tier ?? 3 });
    }
  }

  // 3. daily summary and the nudges (water, meals, walks) at the times each person picked
  for (const n of nudgeList(settings)) {
    if (!n.on) continue;
    for (const hm of n.times) {
      if (!inWindow(lp.minutes, hm)) continue;
      if (n.kind === 'daily') {
        const count = open.filter(q => q.due === lp.date || (q.due && q.due < lp.date)).length;
        out.push({ key: `daily-${lp.date}-${hm}`, title: count ? `${count} quest${count === 1 ? '' : 's'} for today` : 'Nothing due today', body: count ? 'Open Levern to see them' : 'A clear day', url: '#/home' });
      } else {
        out.push({ key: `${n.kind}-${lp.date}-${hm}`, title: n.label, body: NUDGE_BODY[n.kind], url: '#/home' });
      }
    }
  }
  // the most important first: when several arrive together, P1 goes out before P2, and so on
  return out.sort((a, b) => (a.tier ?? 9) - (b.tier ?? 9));
}
const NUDGE_BODY = { water: 'Time for a glass of water.', eat: 'Time to eat something.', walk: 'Stand up and move for a few minutes.' };

// decode the saved document: chunks are concatenated, then inflated when `z` is set (app/js/cloud.js pack/unpack)
export function decodeDoc(parts, z) {
  const all = Buffer.concat(parts.map(p => Buffer.from(p)));
  if (!all.length) return null;
  return JSON.parse((z ? inflateRawSync(all) : all).toString('utf8'));
}

// ---- the job ---------------------------------------------------------------------------------------

async function main() {
  const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || 'null');
  if (!sa) throw new Error('FIREBASE_SERVICE_ACCOUNT is not set');
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:taskflow@example.com', process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
  initializeApp({ credential: cert(sa) });
  const db = getFirestore();
  const now = Date.now();
  let sent = 0, skipped = 0, failed = 0;

  const subs = await db.collectionGroup('push').get();
  for (const snap of subs.docs) {
    if (snap.id !== 'sub') continue;
    const uid = snap.ref.parent.parent.id;
    const sub = snap.data();
    if (!sub?.endpoint) continue;
    try {
      const metaSnap = await db.collection('taskflowUsers').doc(uid).get();
      const md = metaSnap.exists ? metaSnap.data() : {};
      const chunks = await Promise.all(Array.from({ length: md.chunks || 0 }, (_, i) => db.collection('taskflowUsers').doc(uid).collection('chunks').doc(String(i)).get()));
      const doc = decodeDoc(chunks.map(c => (c.exists ? c.get('b') : Buffer.alloc(0))), md.z) || {};
      const stateRef = db.collection('taskflowUsers').doc(uid).collection('push').doc('state');
      const state = (await stateRef.get()).data() || {};
      const seen = new Set(state.sent || []);

      const items = dueNow({ quests: doc.quests || [], settings: doc.settings || {}, tz: md.tz || 'UTC', now })
        .filter(m => !seen.has(m.key));
      skipped += items.length === 0 ? 1 : 0;
      for (const m of items) {
        try {
          await webpush.sendNotification(sub, JSON.stringify({ title: m.title, body: m.body, url: m.url, tag: m.key.split('-')[0] }), { TTL: 3600 });
          seen.add(m.key); sent++;
        } catch (e) {
          if (e.statusCode === 404 || e.statusCode === 410) { await snap.ref.delete(); console.log('removed a subscription that is no longer valid'); break; }
          failed++; console.warn('send failed', e.statusCode || e.message);
        }
      }
      if (items.length) await stateRef.set({ sent: [...seen].slice(-KEEP), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    } catch (e) { failed++; console.warn('person skipped:', e.message); }
  }
  console.log(JSON.stringify({ at: new Date(now).toISOString(), sent, failed, peopleWithNothingDue: skipped }));
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}` || process.argv[1]?.endsWith('send.mjs')) {
  main().catch(e => { console.error(e); process.exit(1); });
}
