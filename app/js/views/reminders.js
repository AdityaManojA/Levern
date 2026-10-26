// The bell panel (due and upcoming reminders) and the quick "remind me" sheet from a quest's bell.
import { dueReminders, upcomingReminders, findQuest, tierLabel, TIER_COLORS, snooze, dismissReminder, setReminder, setAlerts, getState } from '../store.js';
import { fmtStamp, relTime } from '../dates.js';
import { $, esc, sheet, toast, play, ICON } from '../ui.js';
import { permission, requestPermission, supported } from '../notify.js';
import { reminderPicker, bindPicker, bindAlerts } from './common.js';
import { morph } from '../motion.js';
import { mascot } from '../mascot.js';
import { recentNotifs } from '../store.js';
import { completeQuest } from '../complete.js';

const panel = () => $('#rpanel');
export const isOpen = () => panel().classList.contains('open');
export function open() { render(); panel().classList.add('open'); mascot.release(); }
export function close() { panel().classList.remove('open'); }
export function toggle() { play('click', 0.5); isOpen() ? close() : open(); }

export function permNote() {
  const s = getState().settings, p = permission();
  if (!s.notify) return '<p class="small" style="margin-top:10px">System notifications are off in Settings. Reminders still show here and in the badge.</p>';
  if (p === 'granted') return '';
  if (p === 'denied') return '<p class="small" style="margin-top:10px">Notifications are blocked for this site in your browser, so reminders only show inside Levern.</p>';
  if (!supported) return '<p class="small" style="margin-top:10px">This browser has no system notifications. Reminders show inside Levern.</p>';
  return '<p class="small" style="margin-top:10px">Get reminders outside the app too. <button class="mini" data-act="allow-notify">Allow notifications</button></p>';
}

export function render() { morph(panel(), draw); }
function draw() {
  const d = dueReminders(), u = upcomingReminders().slice(0, 12), snoozeMin = getState().settings.snoozeMin;
  const item = (q, due) => `<div data-key="r-${q.id}" class="ritem${due ? '' : ' upcoming'}" style="--c:${TIER_COLORS[q.tier]}">
      <div class="rt">${esc(q.title)}</div>
      <div class="rw">${esc(tierLabel(q.tier))} · ${due ? 'went off ' + esc(relTime(q.remind.at)) : esc(fmtStamp(q.remind.at))}</div>
      <div class="ract">${due ? `<button class="pri" data-act="r-done" data-id="${q.id}">Done</button><button data-act="r-snooze" data-id="${q.id}">Snooze ${snoozeMin} min</button><button data-act="r-dismiss" data-id="${q.id}">Dismiss</button>`
        : `<button data-act="open-r" data-id="${q.id}">Open</button><button data-act="r-remove" data-id="${q.id}">Remove</button>`}</div>
    </div>`;
  const past = recentNotifs(), LABEL = { done: 'Done', snoozed: 'Snoozed', dismissed: 'Dismissed' };
  panel().innerHTML = `<div class="rhead"><b>Notifications</b><button class="iconbtn" data-act="r-close" aria-label="Close" style="width:34px;height:34px">${ICON.x}</button></div>
    <div class="small">${d.length ? `${d.length} due now` : 'Nothing due right now'}</div>
    ${d.map(q => item(q, true)).join('')}
    ${u.length ? `<div class="sec">Coming up</div>${u.map(q => item(q, false)).join('')}` : ''}
    ${past.length ? `<div class="sec">Earlier</div><div class="rpast">${past.map(n => `<button data-key="p-${n.id}-${n.at}" class="rpast-i" data-act="open-r" data-id="${n.id}" style="--c:${TIER_COLORS[n.tier ?? 3]}">
        <span class="dotc"></span><span class="rt">${esc(n.title)}</span><span class="small">${LABEL[n.status] || ''} · ${esc(relTime(n.at))}</span></button>`).join('')}</div>` : ''}
    ${!d.length && !u.length && !past.length ? '<p class="small" style="padding:14px 0 4px">No notifications yet. Tap the bell on any quest to set a reminder.</p>' : ''}
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
  if (q.due) {
    // a dated quest: its reminders are a list before the due time (the sheet stays open to add more)
    bindAlerts(s.querySelector('[data-picker]'), list => {
      if (list.length) requestPermission();
      setAlerts(id, list);
      play('click', 0.6);
      toast(list.length ? `${list.length} reminder${list.length === 1 ? '' : 's'} saved` : 'Reminders off for this quest');
    });
    return;
  }
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
