// Focus timer (Pomodoro). Pick a quest, focus for N minutes, earn EXP (1 per 5 min), take a break.
// Custom: run it for a chosen time (hours and minutes) or until a chosen time of day.
// The timer runs off timestamps saved in the store, so it survives reloads and background tabs.
import { getState, findQuest, startTimer, pauseTimer, resumeTimer, stopTimer, timerElapsed, logSession, sortQuests, tierLabel, TIER_COLORS, setSetting } from '../store.js';
import { focusExp } from '../stats.js';
import { toStr, minutesUntil } from '../dates.js';
import { swap } from '../motion.js';
import { esc, ICON, toast, play } from '../ui.js';
import { show } from '../notify.js';
import { mascot } from '../mascot.js';
import { timeWheelHTML, fmtTime } from '../timewheel.js';
import { playAmbient, stopAmbient, setAmbientKind, getAmbientKind, isAmbientActive } from '../ambient.js';

let tick = null, pickQuest = '', pickMode = 'focus', lastRunning = null;
// the custom length, while picking: { kind: 'for' | 'until', min: minutes, until: 'HH:MM' }, or null for the chips
let custom = null;
const MAX_MIN = 12 * 60;
const customMinutes = () => !custom ? 0 : custom.kind === 'until' ? minutesUntil(custom.until) : custom.min;
const lenLabel = m => { m = Math.round(m); const h = Math.floor(m / 60); return h ? `${h} h${m % 60 ? ` ${m % 60} min` : ''}` : `${m} min`; };
// mm:ss, or h:mm:ss for a custom timer of an hour or more
const fmt = ms => {
  const s = Math.max(0, Math.ceil(ms / 1000)), p = n => String(n).padStart(2, '0');
  return s >= 3600 ? `${Math.floor(s / 3600)}:${p(Math.floor(s / 60) % 60)}:${p(s % 60)}` : `${p(Math.floor(s / 60))}:${p(s % 60)}`;
};

export function render(params) {
  const st = getState(), s = st.settings, t = st.timer;
  if (params.quest && !t) pickQuest = params.quest;
  const open = sortQuests(st.quests.filter(q => !q.done), 'smart');
  if (pickQuest && !findQuest(pickQuest)) pickQuest = '';
  const mode = t ? t.mode : pickMode, minutes = t ? t.minutes : custom ? customMinutes() : (mode === 'focus' ? s.focusMin : s.breakMin);
  const total = minutes * 60000, left = t ? total - timerElapsed(t) : total;
  const q = t ? findQuest(t.questId) : findQuest(pickQuest);
  const today = toStr(new Date());
  const sessions = st.sessions.filter(x => toStr(new Date(x.endedAt)) === today);
  const mins = sessions.reduce((a, x) => a + x.minutes, 0);
  const R = 46, C = 2 * Math.PI * R;
  // Parts that only belong to one state live in collapsible wrappers (.zc). They are drawn in the state
  // the screen was in before, then eased to the new state on the next frame (see mount), so pressing
  // Start lets the setup controls fold away one after another instead of vanishing.
  const running = !!t, was = lastRunning ?? running;
  let i = 0;
  const zc = (whenRunning, html) => `<div class="zc${(whenRunning ? was : !was) ? '' : ' out'}" data-z="${whenRunning === running ? 1 : 0}" style="--i:${i++}"><div>${html}</div></div>`;
  const chips = (mode === 'focus' ? [15, 25, 50] : [5, 10, 15]).map(m => `<button class="chip chip-btn${!custom && m === minutes ? ' on' : ''}" data-act="flen" data-m="${m}">${m} min</button>`).join('')
    + `<button class="chip chip-btn${custom ? ' on' : ''}" data-act="fcustom" aria-expanded="${!!custom}">Custom</button>`;
  const ch = custom ? Math.floor(custom.min / 60) : 0, cm = custom ? custom.min % 60 : 0;
  const customBox = !custom ? '' : `<div class="fcustom">
      <div class="seg"><button class="${custom.kind === 'for' ? 'on' : ''}" data-act="fckind" data-k="for" aria-pressed="${custom.kind === 'for'}">For</button><button class="${custom.kind === 'until' ? 'on' : ''}" data-act="fckind" data-k="until" aria-pressed="${custom.kind === 'until'}">Until</button></div>
      ${custom.kind === 'for'
        ? `<div class="fc-len"><label><input class="field" type="number" inputmode="numeric" min="0" max="12" value="${ch}" data-change="fch" aria-label="Hours"> h</label><label><input class="field" type="number" inputmode="numeric" min="0" max="59" step="5" value="${cm}" data-change="fcm" aria-label="Minutes"> min</label></div>`
        : `<div class="fc-until">${timeWheelHTML(custom.until, { name: 'funtil', label: 'Ends at', attrs: 'data-change="funtil"' })}</div>`}
      <div class="small">${custom.kind === 'for' ? `Ends at ${fmtTime(hhmm(endsAt(minutes)))}` : `${lenLabel(minutes)} from now`}</div>
    </div>`;
  return `
    <div class="h-sub">${running ? (mode === 'focus' ? 'Breathe. One thing at a time.' : 'Rest your eyes.') : 'One thing at a time'}</div>
    <h1 class="h-title">Focus</h1>
    ${zc(false, `<div class="seg"><button class="${mode === 'focus' ? 'on' : ''}" data-act="fmode" data-m="focus">Focus</button><button class="${mode === 'break' ? 'on' : ''}" data-act="fmode" data-m="break">Break</button></div>`)}
    <div class="card focus-card${running && !t.pausedAt ? ' running' : ''}${mode === 'break' ? ' is-break' : ''}">
      <div class="timer">
        <svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="${R}" fill="none" style="stroke:var(--paper)" stroke-width="7"/>
          <circle data-ring cx="50" cy="50" r="${R}" fill="none" stroke="${mode === 'focus' ? 'var(--p1)' : 'var(--sky)'}" stroke-width="7" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - left / total)}"/></svg>
        <div class="timer-in"><div class="t" data-left role="timer" aria-live="off">${fmt(left)}</div><div class="m">${t ? (t.pausedAt ? 'Paused' : mode === 'focus' ? 'Focusing' : 'Break') : `${lenLabel(minutes)} ${mode === 'focus' ? 'focus' : 'break'}`}</div></div>
      </div>
      ${zc(true, `<div class="small" style="padding-bottom:12px">${q ? `On: <b style="color:var(--ink)">${esc(q.title)}</b>` : mode === 'focus' ? 'Just focusing' : 'Stretch, drink water, look away from the screen.'}</div>`)}
      ${mode === 'focus' ? zc(false, `<div style="padding-bottom:12px"><select class="field" data-change="fquest" aria-label="Quest to focus on"><option value="">Just focus (no quest)</option>${open.map(o => `<option value="${esc(o.id)}" ${o.id === pickQuest ? 'selected' : ''}>${esc(o.title)}</option>`).join('')}</select></div>`) : ''}
      ${zc(false, `<div class="chips" style="justify-content:center;padding-bottom:12px">${chips}</div>${customBox}`)}
      <div class="ambient-control">
        <button type="button" class="chip chip-btn ${isAmbientActive() ? 'on' : ''}" data-act="ambient-toggle" aria-label="Toggle ambient sound">
          ${isAmbientActive() ? '🔊' : '🔇'} Ambient: <b>${{ none: 'Off', purr: '🐱 Purr', rain: '🌧️ Rain', cafe: '☕ Cafe', whitenoise: '💨 White Noise' }[getAmbientKind()] || 'Off'}</b>
        </button>
        <select class="field ambient-select" data-change="ambient-kind" aria-label="Select ambient audio">
          <option value="none" ${getAmbientKind() === 'none' ? 'selected' : ''}>Off</option>
          <option value="purr" ${getAmbientKind() === 'purr' ? 'selected' : ''}>🐱 Cat Purring</option>
          <option value="rain" ${getAmbientKind() === 'rain' ? 'selected' : ''}>🌧️ Gentle Rain</option>
          <option value="cafe" ${getAmbientKind() === 'cafe' ? 'selected' : ''}>☕ Cafe Murmur</option>
          <option value="whitenoise" ${getAmbientKind() === 'whitenoise' ? 'selected' : ''}>💨 White Noise</option>
        </select>
      </div>
      <div class="row-btns fbtns">
        ${!t ? `<button class="btn dark" data-key="fb-start" data-act="fstart">${ICON.play} Start</button>`
          : `${t.pausedAt ? `<button class="btn dark" data-key="fb-resume" data-act="fresume">${ICON.play} Resume</button>` : `<button class="btn dark" data-key="fb-pause" data-act="fpause">${ICON.pause} Pause</button>`}<button class="btn white" data-key="fb-stop" data-act="fstop">${mode === 'focus' ? 'Stop' : 'Skip break'}</button>`}
      </div>
      ${q && !q.done ? zc(true, `<div style="padding-top:12px"><button class="link" data-act="toggle" data-id="${q.id}">Quest finished? Mark it done</button></div>`) : ''}
    </div>
    ${zc(false, `<div class="grid2">
      <div class="stat" style="background:var(--mint)"><div class="k">Focused today</div><div class="v">${mins} min</div><div class="s">${sessions.length} session${sessions.length === 1 ? '' : 's'}</div></div>
      <div class="stat" style="background:var(--butter)"><div class="k">Focus EXP today</div><div class="v">+${sessions.reduce((a, x) => a + focusExp(x.minutes), 0)}</div><div class="s">1 EXP per 5 min</div></div>
    </div>`)}
    ${sessions.length ? zc(false, `<div class="sec">Today's sessions</div><div class="card">${sessions.slice().reverse().map(x => { const sq = findQuest(x.questId);
      return `<div class="hist"><span>${sq ? esc(sq.title) : 'Focus'}</span><span class="small">${x.minutes} min · ${new Date(x.endedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span></div>`; }).join('')}</div>`) : ''}
    ${zc(false, '<p class="small" style="margin-top:8px">Stopping early still counts the minutes you focused (from 1 minute).</p>')}`;
}

function finish(early) {
  stopAmbient();
  const t = getState().timer; if (!t) return;
  const minutes = early ? Math.floor(timerElapsed(t) / 60000) : Math.round(t.minutes);
  if (!early) pickMode = t.mode === 'focus' ? 'break' : 'focus';   // set before the re-render below
  else pickMode = t.mode;
  stopTimer();
  mascot.focusMode(false);
  if (t.mode === 'focus') {
    if (minutes >= 1) logSession(t.questId || null, minutes);
    const q = t.questId && findQuest(t.questId);
    if (!early) {
      play('coin');
      toast(`Focus done! +${focusExp(minutes)} EXP. Time for a break.`, 'good');
      show('Focus session done', { body: `${minutes} min${q ? ' on ' + q.title : ''}. +${focusExp(minutes)} EXP. Take a ${getState().settings.breakMin} min break.`, tag: 'focus' });
    } else if (minutes >= 1) toast(`Logged ${minutes} min · +${focusExp(minutes)} EXP`);
  } else {
    if (!early) { play('click'); toast('Break over. Ready for another round?'); show('Break over', { body: 'Ready for another focus session?', tag: 'focus' }); }
  }
}

// ease every collapsible to the state it should be in now
function settle(main) {
  lastRunning = !!getState().timer;
  const parts = main.querySelectorAll('.zc');
  if (![...parts].some(z => z.classList.contains('out') === (z.dataset.z === '1'))) return;
  void main.offsetHeight;   // commit the "before" state so the change animates
  requestAnimationFrame(() => parts.forEach(z => z.classList.toggle('out', z.dataset.z !== '1')));
}

export function mount(main) {
  settle(main);
  clearInterval(tick);
  const t0 = getState().timer;
  if (!t0 || t0.pausedAt) return;
  const R = 46, C = 2 * Math.PI * R;
  tick = setInterval(() => {
    const t = getState().timer; if (!t) return clearInterval(tick);
    const total = t.minutes * 60000, left = total - timerElapsed(t);
    if (left <= 0) { clearInterval(tick); return finish(false); }
    const el = main.querySelector('[data-left]'); if (el) el.textContent = fmt(left);
    const ring = main.querySelector('[data-ring]'); if (ring) ring.setAttribute('stroke-dashoffset', C * (1 - left / total));
    document.title = `${fmt(left)} · ${t.mode === 'focus' ? 'Focus' : 'Break'}`;
  }, 250);
}
export function unmount() { clearInterval(tick); tick = null; }

// a timer that ran out while the app was on another screen or closed
export function checkTimer() {
  const t = getState().timer;
  if (t && !t.pausedAt && timerElapsed(t) >= t.minutes * 60000) finish(false);
}
setInterval(checkTimer, 5000);

export const actions = {
  fmode: el => { pickMode = el.dataset.m; rerender(); },
  flen: el => { custom = null; setSetting(pickMode === 'focus' ? 'focusMin' : 'breakMin', +el.dataset.m); play('click', 0.4); rerender(); },
  // Custom opens with the length the chips had, and an end time that far from now
  'ambient-toggle': () => {
    if (isAmbientActive()) stopAmbient();
    else {
      if (getAmbientKind() === 'none') setAmbientKind('purr');
      playAmbient();
    }
    rerender();
  },
  fcustom: () => {
    const s = getState().settings, m = pickMode === 'focus' ? s.focusMin : s.breakMin;
    custom = custom ? null : { kind: 'for', min: m, until: hhmm(endsAt(m)) };
    play('click', 0.4); rerender();
  },
  fckind: el => { custom = { ...custom, kind: el.dataset.k }; play('click', 0.4); rerender(); },
  fstart: () => {
    if (getAmbientKind() !== 'none') playAmbient();
    const s = getState().settings, m = custom ? customMinutes() : pickMode === 'focus' ? s.focusMin : s.breakMin;
    if (!(m >= 1)) { toast(custom?.kind === 'until' ? 'Pick a time at least a minute from now' : 'Set at least 1 minute'); return; }
    startTimer(pickMode === 'focus' ? pickQuest || null : null, pickMode, Math.min(MAX_MIN, m)); play('click'); if (pickMode === 'focus') mascot.focusMode(true);
  },
  fpause: () => pauseTimer(),
  fresume: () => resumeTimer(),
  fstop: () => finish(true),
};
export function onChange(el) {
  const k = el.dataset.change;
  if (k === 'fquest') pickQuest = el.value;
  if (!custom) return;
  if (k === 'fch' || k === 'fcm') {
    const box = el.closest('.fc-len'), [h, m] = [...box.querySelectorAll('input')].map(i => Math.max(0, Math.floor(+i.value || 0)));
    custom = { ...custom, min: Math.min(MAX_MIN, h * 60 + m) };
    rerender();
  }
  if (k === 'funtil' && el.value) { custom = { ...custom, until: el.value }; rerender(); }
}
const endsAt = m => new Date(Date.now() + m * 60000);
const hhmm = d => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
function rerender() { swap(render({})); settle(document.getElementById('view')); }
export { tierLabel, TIER_COLORS };
