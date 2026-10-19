// The bell panel (due and upcoming reminders) and the quick "remind me" sheet from a quest's bell.
import { dueReminders, upcomingReminders, findQuest, tierLabel, TIER_COLORS, snooze, dismissReminder, setReminder, getState } from '../store.js';
import { fmtStamp, relTime } from '../dates.js';
import { $, esc, sheet, toast, play, ICON } from '../ui.js';
import { permission, requestPermission, supported } from '../notify.js';
import { reminderPicker, bindPicker } from './common.js';
import { completeQuest } from '../complete.js';

const panel = () => $('#rpanel');
export const isOpen = () => panel().classList.contains('open');
export function open() { render(); panel().classList.add('open'); }
export function close() { panel().classList.remove('open'); }
export function toggle() { play('click', 0.5); isOpen() ? close() : open(); }

export function permNote() {
  const s = getState().settings, p = permission();
  if (!s.notify) return '<p class="small" style="margin-top:10px">System notifications are off in Settings. Reminders still show here and in the badge.</p>';
  if (p === 'granted') return '';
  if (p === 'denied') return '<p class="small" style="margin-top:10px">Notifications are blocked for this site in your browser, so reminders only show inside TaskFlow.</p>';
  if (!supported) return '<p class="small" style="margin-top:10px">This browser has no system notifications. Reminders show inside TaskFlow.</p>';
  return '<p class="small" style="margin-top:10px">Get reminders outside the app too. <button class="mini" data-act="allow-notify">Allow notifications</button></p>';
}

export function render() {
  const d = dueReminders(), u = upcomingReminders().slice(0, 12), snoozeMin = getState().settings.snoozeMin;
  const item = (q, due) => `<div class="ritem${due ? '' : ' upcoming'}" style="--c:${TIER_COLORS[q.tier]}">
      <div class="rt">${esc(q.title)}</div>
      <div class="rw">${esc(tierLabel(q.tier))} · ${due ? 'went off ' + esc(relTime(q.remind.at)) : esc(fmtStamp(q.remind.at))}</div>
      <div class="ract">${due ? `<button class="pri" data-act="r-done" data-id="${q.id}">Done</button><button data-act="r-snooze" data-id="${q.id}">Snooze ${snoozeMin} min</button><button data-act="r-dismiss" data-id="${q.id}">Dismiss</button>`
        : `<button data-act="open-r" data-id="${q.id}">Open</button><button data-act="r-remove" data-id="${q.id}">Remove</button>`}</div>
    </div>`;
  panel().innerHTML = `<div class="rhead"><b>Reminders</b><button class="iconbtn" data-act="r-close" aria-label="Close" style="width:34px;height:34px">${ICON.x}</button></div>
    <div class="small">${d.length ? `${d.length} due now` : 'Nothing due right now'}</div>
    ${d.map(q => item(q, true)).join('')}
    ${u.length ? `<div class="sec">Coming up</div>${u.map(q => item(q, false)).join('')}` : ''}
    ${!d.length && !u.length ? '<p class="small" style="padding:14px 0 4px">No reminders yet. Tap the bell on any quest to add one.</p>' : ''}
    ${permNote()}`;
}

export function openRemindSheet(id) {
  const q = findQuest(id); if (!q) return;
  const s = sheet.open(`<div class="sheet-h"><b>Remind me</b><button class="mini" data-close>Close</button></div>
    <div class="small" style="margin-bottom:10px">${esc(q.title)}${q.due ? '' : ' · add a due date to get "before due" options'}</div>
    <div data-picker>${reminderPicker(q)}</div>${permNote()}`);
  s.onclick = e => {
    if (e.target.closest('[data-close]')) sheet.close();
    if (e.target.closest('[data-act="allow-notify"]')) requestPermission().then(p => toast(p === 'granted' ? 'Notifications allowed' : 'Notifications not allowed'));
  };
  bindPicker(s.querySelector('[data-picker]'), (spec, key) => {
    if (spec) requestPermission();
    setReminder(id, spec);
    play('click', 0.6);
    const nq = findQuest(id);
    toast(spec ? `Reminder set · ${fmtStamp(nq.remind.at)}` : 'Reminder removed');
    if (key !== 'custom') sheet.close();
  });
}

export const actions = {
  'r-close': close,
  'r-done': el => completeQuest(el.dataset.id),
  'r-snooze': el => { snooze(el.dataset.id); play('click', 0.6); toast(`Snoozed for ${getState().settings.snoozeMin} min`); },
  'r-dismiss': el => { dismissReminder(el.dataset.id); play('click', 0.5); },
  'r-remove': el => { setReminder(el.dataset.id, null); play('click', 0.5); },
  'open-r': el => { close(); location.hash = '#/quest/' + el.dataset.id; },
  'remind-edit': el => openRemindSheet(el.dataset.id),
  'allow-notify': () => requestPermission().then(p => { toast(p === 'granted' ? 'Notifications allowed' : 'Notifications not allowed'); if (isOpen()) render(); }),
};
