// Quest detail: edit everything about one quest. Fields save as you go.
import { findQuest, updateQuest, deleteQuest, addSubtask, updateSubtask, removeSubtask, setReminder, setAlerts, tierLabel, TIER_COLORS, getState } from '../store.js';
import { dueLabel, dueStatus, fmtStamp, todayStr } from '../dates.js';
import { REPEATS, describe } from '../recur.js';
import { googleLink, buildICS } from '../ics.js';
import { esc, ICON, toast, play, confirmBox, download } from '../ui.js';
import { tierPicker, reminderPicker, bindPicker, bindAlerts, goalBlock } from './common.js';
import { GOAL_DEFAULT, clampGoal } from '../goals.js';
import { undoGoal } from '../store.js';
import { requestPermission } from '../notify.js';
import { sketchThumbs, openInk, openSketch } from './ink.js';
import { timeWheelHTML } from '../timewheel.js';
import { cloudOn, cloudReady, syncNow } from '../cloud.js';

let current = null;

export function render(params) {
  const q = current = findQuest(params.id);
  if (!q) {
    // opened from a notification or link before this device has the quest: wait for the account's copy
    // (the page redraws when it arrives) instead of saying it's gone
    const waiting = params.id && cloudOn() && !cloudReady();
    if (waiting) return `<a class="back" href="#/quests">${ICON.back} Quests</a><div class="card empty"><b>Loading your quest…</b><span class="small">Getting the latest from your account.</span></div>`;
    if (params.id && cloudOn()) syncNow();   // one more look at the account; it redraws if the quest turns up
    return `<a class="back" href="#/quests">${ICON.back} Quests</a><div class="card empty"><b>Quest not found</b><span class="small">${params.id ? 'It may have been deleted, or it was made on another device that hasn’t synced yet.' : 'This link doesn’t point to a quest.'}</span>
      <a class="btn white sm" href="#/quests" style="margin-top:10px">See all quests</a></div>`;
  }
  const st = dueStatus(q), done = q.subtasks.filter(s => s.done).length;
  const history = getState().history.filter(h => h.questId === q.id).length;
  return `<div class="detail">
    <a class="back" href="#/quests">${ICON.back} Quests</a>
    <div class="hero" style="--c:${TIER_COLORS[q.tier]}">
      <button class="chk${q.done ? ' on' : ''}" data-act="toggle" data-id="${q.id}" aria-label="${q.done ? 'Mark not done' : 'Complete'}"></button>
      <div style="flex:1;min-width:0">
        <input class="title-in" value="${esc(q.title)}" data-input="title" aria-label="Title" maxlength="140">
        <div class="small" style="color:var(--ink)">${esc(tierLabel(q.tier))}${q.due ? ` · <span style="${st === 'overdue' ? 'color:var(--red);font-weight:700' : ''}">${esc(dueLabel(q))}</span>` : ''}${q.repeat ? ' · ' + esc(describe(q.repeat, q.due)) : ''}${q.done ? ' · done' : ''}</div>
      </div>
    </div>
    ${q.repeat && history ? `<div class="small" style="margin:6px 2px 0">Completed ${history} time${history === 1 ? '' : 's'}. Ticking it moves it to the next date.</div>` : ''}

    <label class="lbl">Priority</label>
    ${tierPicker(q.tier)}

    <label class="lbl">Due</label>
    <div class="two">
      <input class="field" type="date" value="${q.due || ''}" data-change="due" aria-label="Due date">
      ${timeWheelHTML(q.time || '', { name: 'time', label: 'Due time', attrs: 'data-change="time"', disabled: !q.due })}
    </div>
    <div class="chips" style="margin-top:8px">
      <button class="chip chip-btn" data-act="due-quick" data-d="0">Today</button><button class="chip chip-btn" data-act="due-quick" data-d="1">Tomorrow</button>
      <button class="chip chip-btn" data-act="due-quick" data-d="7">In a week</button>${q.due ? '<button class="chip chip-btn" data-act="due-quick" data-d="">No date</button>' : ''}
    </div>

    <label class="lbl" for="repeat">Repeat</label>
    <select class="field" id="repeat" data-change="repeat">${REPEATS.map(([k, l]) => `<option value="${k}" ${(q.repeat?.freq || (q.goal ? 'goal' : '')) === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
    ${q.repeat && q.due && (q.repeat.freq === 'monthly' || q.repeat.freq === 'yearly') ? `<div class="small" style="margin:6px 0 10px">${esc(describe(q.repeat, q.due))}. To repeat on another date, change the due date.</div>` : ''}
    ${q.goal ? goalBlock(q) : ''}

    <label class="lbl">Reminder</label>
    <div data-picker>${reminderPicker(q)}</div>

    <label class="lbl">Subtasks ${q.subtasks.length ? `<span class="small">${done}/${q.subtasks.length}</span>` : ''}</label>
    <div class="card" data-tour="subtasks" style="padding:6px 12px">
      ${q.subtasks.map(s => `<div data-key="s-${s.id}" class="sub${s.done ? ' done' : ''}" style="--c:${TIER_COLORS[s.tier ?? q.tier]}">
        <button class="chk${s.done ? ' on' : ''}" data-act="sub-toggle" data-sid="${s.id}" aria-label="Toggle subtask"></button>
        <input class="st" value="${esc(s.title)}" data-input="sub-title" data-sid="${s.id}" aria-label="Subtask">
        <select data-change="sub-tier" data-sid="${s.id}" aria-label="Subtask priority">${TIER_COLORS.map((_, i) => `<option value="${i}" ${i === (s.tier ?? q.tier) ? 'selected' : ''}>P${i + 1}</option>`).join('')}</select>
        <button class="x" data-act="sub-del" data-sid="${s.id}" aria-label="Delete subtask">${ICON.x}</button>
      </div>`).join('') || '<div class="small" style="padding:8px 0">Break it into smaller steps.</div>'}
      <form class="addsub" data-addsub><input class="field" name="t" placeholder="Add a subtask" autocomplete="off" style="padding:8px 12px"><button class="mini">Add</button></form>
    </div>

    <label class="lbl" for="notes">Notes</label>
    <textarea class="field" id="notes" data-input="notes" placeholder="Links, details, anything">${esc(q.notes)}</textarea>

    <label class="lbl">Sketches and handwriting ${q.sketches?.length ? `<span class="small">${q.sketches.length}</span>` : ''}</label>
    ${sketchThumbs(q)}

    <div class="sec">Do it</div>
    <div class="row-btns">
      <a class="btn white sm" href="#/focus?quest=${encodeURIComponent(q.id)}">${ICON.focus} Focus on this</a>
    </div>
    ${q.due ? `<div class="sec">Add to your calendar</div>
    <div class="row-btns">
      <a class="btn white sm" href="${esc(googleLink(q))}" target="_blank" rel="noopener">Google Calendar</a>
      <button class="btn white sm" data-act="ics">${ICON.download} Apple / Outlook (.ics)</button>
    </div>` : ''}
    <div style="height:18px"></div>
    <button class="btn ghost block" data-act="delete">${ICON.trash} Delete quest</button>
    <p class="small" style="text-align:center;margin-top:10px">Added ${esc(fmtStamp(q.createdAt))}</p>
  </div>`;
}

export function mount(main) {
  const q = current; if (!q) return;
  const root = main.querySelector('.detail');
  bindPicker(root.querySelector('[data-picker]'), (spec, key) => {
    if (spec) requestPermission();
    setReminder(q.id, spec);
    play('click', 0.5);
    toast(spec ? `Reminder set · ${fmtStamp(findQuest(q.id).remind.at)}` : 'Reminder removed');
  });
  // a dated quest: its reminders are a list before the due time
  bindAlerts(root.querySelector('[data-picker]'), list => {
    if (list.length) requestPermission();
    setAlerts(q.id, list);
    play('click', 0.5);
    toast(list.length ? `${list.length} reminder${list.length === 1 ? '' : 's'} saved` : 'Reminders off for this quest');
  });
  root.querySelector('[data-addsub]').addEventListener('submit', e => {
    e.preventDefault();
    const v = e.target.t.value.trim(); if (!v) return;
    addSubtask(q.id, v); play('click', 0.5);
    requestAnimationFrame(() => document.querySelector('[data-addsub] input')?.focus());
  });
  root.querySelector('.pick').addEventListener('click', e => {
    const b = e.target.closest('[data-tier]'); if (!b) return;
    updateQuest(q.id, { tier: +b.dataset.tier }); play('click', 0.5);
  });
}

export const actions = {
  'sub-toggle': el => { const s = current.subtasks.find(x => x.id === el.dataset.sid); updateSubtask(current.id, s.id, { done: !s.done }); play('click', 0.6); },
  'sub-del': el => removeSubtask(current.id, el.dataset.sid),
  'ink-new': el => openInk(current.id, { kind: el.dataset.kind }),
  'sketch-view': el => openSketch(current.id, el.dataset.kid),
  'goal-step': el => { const q = current; updateQuest(q.id, { goal: { ...q.goal, target: clampGoal(q.goal.target + +el.dataset.d) } }); play('click', 0.4); },
  'goal-undo': el => { undoGoal(el.dataset.id); play('click', 0.4); toast('Took back the last time'); },
  'due-quick': el => { const d = el.dataset.d; updateQuest(current.id, d === '' ? { due: null, time: null, repeat: null } : { due: addDaysFromToday(+d) }); play('click', 0.5); },
  ics: () => { download(`${current.title.replace(/[^\w\- ]+/g, '').trim() || 'quest'}.ics`, buildICS([current]), 'text/calendar'); toast('Calendar file saved. Open it to add the event.'); },
  delete: async () => {
    if (!(await confirmBox(`Delete "${current.title}"?`))) return;
    const t = current.title; deleteQuest(current.id); location.hash = '#/quests'; toast(`Deleted: ${t}`);
  },
};
const addDaysFromToday = n => { const d = new Date(); d.setDate(d.getDate() + n); return todayStr(d); };

export function onChange(el) {
  const k = el.dataset.change, q = current;
  if (k === 'due') updateQuest(q.id, el.value ? { due: el.value } : { due: null, time: null, repeat: null });
  if (k === 'time') updateQuest(q.id, { time: el.value || null });
  if (k === 'repeat' && el.value === 'goal') { updateQuest(q.id, { goal: q.goal || { target: GOAL_DEFAULT, log: [] }, repeat: null, due: null, time: null, alerts: undefined }); toast('Weekly goal set. Tick it each time you do it.'); }
  else if (k === 'repeat') { updateQuest(q.id, { repeat: el.value ? { freq: el.value } : null, goal: null }); if (el.value) { const d = describe({ freq: el.value }, q.due); toast(`Repeats ${d[0].toLowerCase() + d.slice(1)}`); } }
  if (k === 'sub-tier') updateSubtask(q.id, el.dataset.sid, { tier: +el.value });
}
// typing saves quietly (no re-render, so the cursor stays put)
export function onInput(el) {
  const k = el.dataset.input, q = current;
  if (k === 'title' && el.value.trim()) updateQuest(q.id, { title: el.value.trim() }, { quiet: true });
  if (k === 'notes') updateQuest(q.id, { notes: el.value }, { quiet: true });
  if (k === 'sub-title') updateSubtask(q.id, el.dataset.sid, { title: el.value }, { quiet: true });
}
