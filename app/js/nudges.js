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

export const INTERVAL_OPTIONS = [
  { val: 30, label: 'Every 30 minutes' },
  { val: 45, label: 'Every 45 minutes' },
  { val: 60, label: 'Every 1 hour' },
  { val: 90, label: 'Every 1.5 hours' },
  { val: 120, label: 'Every 2 hours' },
  { val: 180, label: 'Every 3 hours' },
  { val: 240, label: 'Every 4 hours' },
];

// Generates an array of 'HH:MM' times from start to end by interval (in minutes)
export function generateIntervalTimes(start = '10:00', end = '22:00', intervalMins = 60) {
  const [sh, sm] = (start || '10:00').split(':').map(Number);
  const [eh, em] = (end || '22:00').split(':').map(Number);
  const interval = Math.max(15, Number(intervalMins) || 60);

  let startTotalMins = (sh || 0) * 60 + (sm || 0);
  let endTotalMins = (eh || 0) * 60 + (em || 0);

  // If end is 00:00 (midnight) and start > 0, treat end as 24:00 (1440 mins)
  if (endTotalMins === 0 && startTotalMins > 0) {
    endTotalMins = 1440;
  } else if (endTotalMins < startTotalMins) {
    endTotalMins += 1440;
  }

  const times = [];
  const pad = n => String(n).padStart(2, '0');
  for (let m = startTotalMins; m <= endTotalMins; m += interval) {
    const wrappedM = m % 1440;
    const h = Math.floor(wrappedM / 60);
    const min = wrappedM % 60;
    times.push(`${pad(h)}:${pad(min)}`);
    if (m === endTotalMins) break;
  }

  return [...new Set(times)];
}

const LINES = {
  water: ['Time for a glass of water.', 'Quick sip break. Your brain is mostly water.', 'Water check: have a glass.'],
  eat: ['Time to eat something.', 'Food break. A proper one.', 'Have you eaten? Grab something good.'],
  walk: ['Stand up and move for a few minutes.', 'Walk break: a few minutes on your feet.', 'Stretch and take a short walk.'],
};
const FIRED_KEY = 'taskflow-nudges-fired';

// settings.nudges = { daily: { on, times }, water: { on, intervalMode, interval, start, end, times }, ... }
export function nudgeSettings() {
  const s = getState().settings.nudges || {};
  return Object.fromEntries(Object.entries(KINDS).map(([k, d]) => {
    const raw = s[k] || {};
    const intervalMode = !!raw.intervalMode;
    const interval = Number(raw.interval) || (k === 'water' ? 120 : k === 'eat' ? 240 : 180);
    const start = raw.start || (k === 'water' ? '10:00' : k === 'eat' ? '08:30' : '10:00');
    const end = raw.end || (k === 'water' ? '20:00' : k === 'eat' ? '20:00' : '18:00');
    let times = raw.times;
    if (intervalMode) {
      times = generateIntervalTimes(start, end, interval);
    } else if (!times || !times.length) {
      times = d.defaults;
    }
    return [k, {
      on: raw.on ?? (k === 'daily'),
      intervalMode,
      interval,
      start,
      end,
      times: times.slice().sort(),
    }];
  }));
}

export function setNudge(kind, patch) {
  const all = nudgeSettings();
  all[kind] = { ...all[kind], ...patch };
  if (all[kind].intervalMode) {
    all[kind].times = generateIntervalTimes(all[kind].start, all[kind].end, all[kind].interval);
  } else if (patch.times) {
    all[kind].times = [...new Set(patch.times)].sort();
  }
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
// rows of: name and hint, an on/off switch, specific times or interval settings
export function editor({ only } = {}) {
  const set = nudgeSettings();
  return Object.entries(KINDS).filter(([k]) => !only || only.includes(k)).map(([k, d]) => {
    const n = set[k];
    const isIntervalCapable = k !== 'daily';
    return `<div class="nrow" data-nudge="${k}">
      <div class="srow"><div class="l"><b>${esc(d.label)}</b><small>${esc(d.hint)}</small></div>
        <button class="tog" role="switch" aria-checked="${n.on}" aria-label="${esc(d.label)} reminders" data-nudge-tog="${k}"></button></div>
      ${n.on ? `
        ${isIntervalCapable ? `
        <div class="nudge-mode-row">
          <div class="seg sm-seg" style="margin:4px 0 8px;width:auto">
            <button type="button" class="${!n.intervalMode ? 'on' : ''}" data-nudge-mode="${k}" data-mode="times" aria-pressed="${!n.intervalMode}">Specific times</button>
            <button type="button" class="${n.intervalMode ? 'on' : ''}" data-nudge-mode="${k}" data-mode="interval" aria-pressed="${n.intervalMode}">Fixed intervals</button>
          </div>
        </div>` : ''}

        ${n.intervalMode && isIntervalCapable ? `
        <div class="nudge-interval-box" role="group" aria-label="${esc(d.label)} interval settings">
          <div class="nudge-cfg-row">
            <span class="small muted">Interval:</span>
            <select class="field sm" data-nudge-interval="${k}" aria-label="Remind interval for ${esc(d.label)}">
              ${INTERVAL_OPTIONS.map(opt => `<option value="${opt.val}" ${n.interval === opt.val ? 'selected' : ''}>${esc(opt.label)}</option>`).join('')}
            </select>
          </div>
          <div class="nudge-cfg-row nudge-range-row">
            <span class="small muted">Between:</span>
            <div class="nudge-time-pair">
              <input type="time" class="field sm time-field" data-nudge-start="${k}" value="${n.start}" aria-label="Start time">
              <span class="nudge-to">to</span>
              <input type="time" class="field sm time-field" data-nudge-end="${k}" value="${n.end}" aria-label="End time">
            </div>
          </div>
          <div class="small muted nudge-summary">
            ${n.times.length ? `${n.times.length} reminders a day (${fmtTime(n.start)} – ${fmtTime(n.end)})` : 'No reminders in this time window'}
          </div>
        </div>
        ` : `
        <div class="ntimes" role="group" aria-label="${esc(d.label)} times">${n.times.map(t => `<span class="ntime">${esc(fmtTime(t))}<button type="button" data-nudge-del="${k}" data-t="${t}" aria-label="Remove ${esc(fmtTime(t))}">×</button></span>`).join('')}
          <span class="nadd"><input type="time" data-nudge-add="${k}" data-empty="+ Add a time" aria-label="Add a time for ${esc(d.label)}"></span></div>
        `}
      ` : ''}
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
    const modeBtn = e.target.closest('[data-nudge-mode]');
    if (modeBtn) {
      const k = modeBtn.dataset.nudgeMode;
      const isInterval = modeBtn.dataset.mode === 'interval';
      setNudge(k, { intervalMode: isInterval });
      play('click', 0.4);
      return onChange();
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
    if (add && add.value) {
      const k = add.dataset.nudgeAdd;
      setNudge(k, { times: [...nudgeSettings()[k].times, add.value] });
      play('click', 0.5); toast(`${KINDS[k].label}: ${fmtTime(add.value)} added`, 'good');
      return onChange();
    }
    const intSel = e.target.closest('[data-nudge-interval]');
    if (intSel) {
      const k = intSel.dataset.nudgeInterval;
      setNudge(k, { interval: Number(intSel.value) });
      play('click', 0.4);
      return onChange();
    }
    const startIn = e.target.closest('[data-nudge-start]');
    if (startIn && startIn.value) {
      const k = startIn.dataset.nudgeStart;
      setNudge(k, { start: startIn.value });
      return onChange();
    }
    const endIn = e.target.closest('[data-nudge-end]');
    if (endIn && endIn.value) {
      const k = endIn.dataset.nudgeEnd;
      setNudge(k, { end: endIn.value });
      return onChange();
    }
  });
}

export function startNudges() {
  // one listener for every editor (Settings re-renders on its own; onboarding listens for this event)
  bindEditor(document, () => document.dispatchEvent(new CustomEvent('nudges:change')));
  check();
  setInterval(check, 20000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
}
