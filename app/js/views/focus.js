// Focus timer (Pomodoro). Pick a quest, focus for N minutes, earn EXP (1 per 5 min), take a break.
// The timer runs off timestamps saved in the store, so it survives reloads and background tabs.
import { getState, findQuest, startTimer, pauseTimer, resumeTimer, stopTimer, timerElapsed, logSession, sortQuests, tierLabel, TIER_COLORS, setSetting } from '../store.js';
import { focusExp } from '../stats.js';
import { toStr } from '../dates.js';
import { esc, ICON, toast, play } from '../ui.js';
import { show } from '../notify.js';

let tick = null, pickQuest = '', pickMode = 'focus';
const fmt = ms => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };

export function render(params) {
  const st = getState(), s = st.settings, t = st.timer;
  if (params.quest && !t) pickQuest = params.quest;
  const open = sortQuests(st.quests.filter(q => !q.done), 'smart');
  if (pickQuest && !findQuest(pickQuest)) pickQuest = '';
  const mode = t ? t.mode : pickMode, minutes = t ? t.minutes : (mode === 'focus' ? s.focusMin : s.breakMin);
  const total = minutes * 60000, left = t ? total - timerElapsed(t) : total;
  const q = t ? findQuest(t.questId) : findQuest(pickQuest);
  const today = toStr(new Date());
  const sessions = st.sessions.filter(x => toStr(new Date(x.endedAt)) === today);
  const mins = sessions.reduce((a, x) => a + x.minutes, 0);
  const R = 46, C = 2 * Math.PI * R;
  return `
    <div class="h-sub">One thing at a time</div>
    <h1 class="h-title">Focus</h1>
    ${t ? '' : `<div class="seg"><button class="${mode === 'focus' ? 'on' : ''}" data-act="fmode" data-m="focus">Focus</button><button class="${mode === 'break' ? 'on' : ''}" data-act="fmode" data-m="break">Break</button></div>`}
    <div class="card" style="text-align:center;background:${mode === 'focus' ? '#fff' : '#EAF5FC'}">
      <div class="timer">
        <svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="${R}" fill="none" stroke="#EFE7DA" stroke-width="7"/>
          <circle data-ring cx="50" cy="50" r="${R}" fill="none" stroke="${mode === 'focus' ? 'var(--p1)' : 'var(--sky)'}" stroke-width="7" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - left / total)}"/></svg>
        <div class="timer-in"><div class="t" data-left role="timer" aria-live="off">${fmt(left)}</div><div class="m">${t ? (t.pausedAt ? 'Paused' : mode === 'focus' ? 'Focusing' : 'Break') : mode === 'focus' ? `${minutes} min focus` : `${minutes} min break`}</div></div>
      </div>
      ${t ? `<div class="small" style="margin-bottom:12px">${q ? `On: <b style="color:var(--ink)">${esc(q.title)}</b>` : mode === 'focus' ? 'No quest picked' : 'Stretch, drink water, look away from the screen.'}</div>`
        : mode === 'focus' ? `<select class="field" data-change="fquest" aria-label="Quest to focus on" style="margin-bottom:12px"><option value="">Just focus (no quest)</option>${open.map(o => `<option value="${esc(o.id)}" ${o.id === pickQuest ? 'selected' : ''}>${esc(o.title)}</option>`).join('')}</select>` : ''}
      ${t ? '' : `<div class="chips" style="justify-content:center;margin-bottom:12px">${(mode === 'focus' ? [15, 25, 50] : [5, 10, 15]).map(m => `<button class="chip chip-btn${m === minutes ? ' on' : ''}" data-act="flen" data-m="${m}">${m} min</button>`).join('')}</div>`}
      <div class="row-btns">
        ${!t ? `<button class="btn dark" data-act="fstart">${ICON.play} Start</button>`
          : `${t.pausedAt ? `<button class="btn dark" data-act="fresume">${ICON.play} Resume</button>` : `<button class="btn dark" data-act="fpause">${ICON.pause} Pause</button>`}<button class="btn white" data-act="fstop">${mode === 'focus' ? 'Stop' : 'Skip break'}</button>`}
      </div>
      ${t && q && !q.done ? `<button class="link" data-act="toggle" data-id="${q.id}" style="margin-top:12px">Quest finished? Mark it done</button>` : ''}
    </div>
    <div class="grid2">
      <div class="stat" style="background:var(--mint)"><div class="k">Focused today</div><div class="v">${mins} min</div><div class="s">${sessions.length} session${sessions.length === 1 ? '' : 's'}</div></div>
      <div class="stat" style="background:var(--butter)"><div class="k">Focus EXP today</div><div class="v">+${sessions.reduce((a, x) => a + focusExp(x.minutes), 0)}</div><div class="s">1 EXP per 5 min</div></div>
    </div>
    ${sessions.length ? `<div class="sec">Today's sessions</div><div class="card">${sessions.slice().reverse().map(x => { const sq = findQuest(x.questId);
      return `<div class="hist"><span>${sq ? esc(sq.title) : 'Focus'}</span><span class="small">${x.minutes} min · ${new Date(x.endedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span></div>`; }).join('')}</div>` : ''}
    <p class="small" style="margin-top:8px">Stopping early still counts the minutes you focused (from 1 minute).</p>`;
}

function finish(early) {
  const t = getState().timer; if (!t) return;
  const minutes = early ? Math.floor(timerElapsed(t) / 60000) : t.minutes;
  if (!early) pickMode = t.mode === 'focus' ? 'break' : 'focus';   // set before the re-render below
  else pickMode = t.mode;
  stopTimer();
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

export function mount(main) {
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
  flen: el => { setSetting(pickMode === 'focus' ? 'focusMin' : 'breakMin', +el.dataset.m); play('click', 0.4); },
  fstart: () => { const s = getState().settings; startTimer(pickMode === 'focus' ? pickQuest || null : null, pickMode, pickMode === 'focus' ? s.focusMin : s.breakMin); play('click'); },
  fpause: () => pauseTimer(),
  fresume: () => resumeTimer(),
  fstop: () => finish(true),
};
export function onChange(el) { if (el.dataset.change === 'fquest') pickQuest = el.value; }
function rerender() { document.getElementById('view').innerHTML = render({}); }
export { tierLabel, TIER_COLORS };
