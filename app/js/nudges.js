// Daily reminders that aren't tied to one quest: a look at today's quests, and gentle nudges to drink
// water, eat, and get up for a walk, each at times the person picks (as many a day as they like).
// Shown like quest reminders: a system notification when allowed, a toast, and Mochi. The service
// worker gets the next day of them too (reminders.js mirror), so an installed app can show them closed.
import { getState, setSetting } from './store.js';
import { todayStr, addDays, at, fmtTime, dueStatus } from './dates.js';
import * as N from './notify.js';
import { toast, play, esc } from './ui.js';

export const KINDS = {
  daily: { label: "Today's quests", hint: 'A look at what\'s due, so nothing slips', defaults: ['09:00'] },
  water: { label: 'Drink water', hint: 'A glass of water, a few times a day', defaults: ['10:00', '12:00', '14:00', '16:00', '18:00'] },
  eat: { label: 'Eat something', hint: 'Meals and snacks, so you don\'t skip them', defaults: ['08:30', '13:00', '20:00'] },
  walk: { label: 'Take a walk', hint: 'Stand up, stretch, move for a few minutes', defaults: ['11:00', '16:00'] },
};
const LINES = {
  water: ['Time for a glass of water.', 'Quick sip break. Your brain is mostly water.', 'Water check: have a glass.'],
  eat: ['Time to eat something.', 'Food break. A proper one.', 'Have you eaten? Grab something good.'],
  walk: ['Stand up and move for a few minutes.', 'Walk break: a few minutes on your feet.', 'Stretch and take a short walk.'],
};
const FIRED_KEY = 'taskflow-nudges-fired';

// settings.nudges = { daily: { on, times }, water: {...}, eat: {...}, walk: {...} }
export function nudgeSettings() {
  const s = getState().settings.nudges || {};
  return Object.fromEntries(Object.entries(KINDS).map(([k, d]) => [k, { on: s[k]?.on ?? k === 'daily', times: (s[k]?.times?.length ? s[k].times : d.defaults).slice().sort() }]));
}
export function setNudge(kind, patch) {
  const all = nudgeSettings();
  all[kind] = { ...all[kind], ...patch };
  if (patch.times) all[kind].times = [...new Set(patch.times)].sort();
  setSetting('nudges', all);
}

function todaysQuestsLine(now = new Date()) {
  const open = getState().quests.filter(q => !q.done && q.due && ['overdue', 'today'].includes(dueStatus(q, now)));
  if (!open.length) return { title: 'Nothing due today', body: 'A clear day. Add a quest if there\'s something you want to get done.' };
  const names = open.slice(0, 3).map(q => q.title).join(', ');
  return { title: `${open.length} quest${open.length === 1 ? '' : 's'} for today`, body: names + (open.length > 3 ? ` and ${open.length - 3} more` : '') };
}
function message(kind, at) {
  if (kind === 'daily') return todaysQuestsLine(new Date(at));
  const lines = LINES[kind];
  return { title: KINDS[kind].label, body: lines[Math.floor(at / 3600000) % lines.length] };
}

// every nudge from `from` to `to` (ms), with a stable id per kind, day and time
export function occurrences(from, to) {
  const out = [], set = nudgeSettings();
  for (let d = todayStr(new Date(from)); at(d) <= to; d = addDays(d, 1)) {
    for (const [kind, n] of Object.entries(set)) {
      if (!n.on) continue;
      for (const t of n.times) { const ms = at(d, t); if (ms >= from && ms <= to) out.push({ id: `${kind}-${d}-${t}`, kind, at: ms }); }
    }
  }
  return out.sort((a, b) => a.at - b.at);
}
// the next day of nudges, for the service worker
export const upcoming = (now = Date.now()) => occurrences(now, now + 26 * 3600000).map(o => ({ id: o.id, kind: 'nudge', at: o.at, ...message(o.kind, o.at) }));

const fired = () => { try { return new Set(JSON.parse(localStorage.getItem(FIRED_KEY)) || []); } catch (e) { return new Set(); } };
const saveFired = s => { try { localStorage.setItem(FIRED_KEY, JSON.stringify([...s].slice(-300))); } catch (e) {} };

// show nudges whose time has come (only recent ones: opening the app after hours doesn't replay the day)
export async function check(now = Date.now()) {
  const due = occurrences(now - 10 * 60000, now);
  if (!due.length) return;
  const done = fired(), fresh = due.filter(o => !done.has(o.id));
  if (!fresh.length) return;
  fresh.forEach(o => done.add(o.id)); saveFired(done);
  const { shown } = await N.drainFromSW();
  const swShown = new Set(shown);
  const last = fresh[fresh.length - 1], m = message(last.kind, last.at);
  if (getState().settings.notify) for (const o of fresh) {
    if (swShown.has(`${o.id}@${o.at}`)) continue;
    const mm = message(o.kind, o.at);
    N.show(mm.title, { body: mm.body, tag: 'nudge-' + o.kind, renotify: true, data: { url: '#/home' } });
  }
  toast(`${m.title}. ${m.body}`, 'remind');
  play('chime', 0.6);
}

/* ---------- the editor, shared by Settings and onboarding ---------- */
// rows of: name and hint, an on/off switch, the times as chips (tap × to remove) and "+ time"
export function editor({ only } = {}) {
  const set = nudgeSettings();
  return Object.entries(KINDS).filter(([k]) => !only || only.includes(k)).map(([k, d]) => {
    const n = set[k];
    return `<div class="nrow" data-nudge="${k}">
      <div class="srow"><div class="l"><b>${esc(d.label)}</b><small>${esc(d.hint)}</small></div>
        <button class="tog" role="switch" aria-checked="${n.on}" aria-label="${esc(d.label)} reminders" data-nudge-tog="${k}"></button></div>
      ${n.on ? `<div class="ntimes" role="group" aria-label="${esc(d.label)} times">${n.times.map(t => `<span class="ntime">${esc(fmtTime(t))}<button type="button" data-nudge-del="${k}" data-t="${t}" aria-label="Remove ${esc(fmtTime(t))}">×</button></span>`).join('')}
        <span class="nadd"><input type="time" data-nudge-add="${k}" data-empty="+ Add a time" aria-label="Add a time for ${esc(d.label)}"></span></div>` : ''}
    </div>`;
  }).join('');
}
// wire an editor inside root; onChange runs after every change (to redraw)
export function bindEditor(root, onChange) {
  root.addEventListener('click', async e => {
    const tg = e.target.closest('[data-nudge-tog]');
    if (tg) {
      const k = tg.dataset.nudgeTog, on = !nudgeSettings()[k].on;
      tg.setAttribute('aria-checked', on);
      setNudge(k, { on }); play('click', 0.5);
      if (on && getState().settings.notify) await N.requestPermission();
      return setTimeout(onChange, 250);
    }
    const del = e.target.closest('[data-nudge-del]');
    if (del) {
      const k = del.dataset.nudgeDel, times = nudgeSettings()[k].times.filter(t => t !== del.dataset.t);
      setNudge(k, times.length ? { times } : { times: [], on: false });
      play('click', 0.4); onChange();
    }
  });
  root.addEventListener('change', e => {
    const add = e.target.closest('[data-nudge-add]');
    if (!add || !add.value) return;
    const k = add.dataset.nudgeAdd;
    setNudge(k, { times: [...nudgeSettings()[k].times, add.value] });
    play('click', 0.5); toast(`${KINDS[k].label}: ${fmtTime(add.value)} added`, 'good');
    onChange();
  });
}

export function startNudges() {
  // one listener for every editor (Settings re-renders on its own; onboarding listens for this event)
  bindEditor(document, () => document.dispatchEvent(new CustomEvent('nudges:change')));
  check();
  setInterval(check, 20000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
}
