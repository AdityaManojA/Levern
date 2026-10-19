// Reminder scheduler (page side). Every second it looks for reminders whose time has come, marks
// them fired, and shows a system notification plus an in-app toast. The count of due reminders
// drives the red badges, the tab title and the app-icon badge.
import { getState, subscribe, markFired, dueReminders, upcomingReminders, findQuest, tierLabel, toggleDone, snooze, commit } from './store.js';
import * as N from './notify.js';
import { toast, play } from './ui.js';
import { dueLabel } from './dates.js';
import { mascot } from './mascot.js';

const baseTitle = document.title;
let lastSchedule = '';

export function body(q, count) {
  const parts = [tierLabel(q.tier)];
  if (q.due) parts.push(dueLabel(q));
  return parts.join(' · ') + (count > 1 ? `\n${count} reminders due in TaskFlow` : '');
}

export async function check() {
  const st = getState(), now = Date.now();
  const fresh = st.quests.filter(q => q.remind && !q.remind.fired && !q.done && q.remind.at <= now);
  if (!fresh.length) return;
  markFired(fresh.map(q => q.id));
  const count = dueReminders().length;
  const { shown } = await N.drainFromSW();
  const shownSet = new Set(shown);
  if (st.settings.notify) {
    for (const q of fresh) {
      if (shownSet.has(`${q.id}@${q.remind.at}`)) continue;   // the service worker already showed it
      N.show(`Reminder: ${q.title}`, {
        body: body(q, count), tag: 'quest-' + q.id, renotify: true, data: { id: q.id, url: '#/quest/' + q.id },
        actions: [{ action: 'done', title: 'Done' }, { action: 'snooze', title: `Snooze ${st.settings.snoozeMin} min` }],
      });
    }
  }
  toast(fresh.length > 1 ? `🔔 ${fresh.length} reminders due` : `🔔 Reminder: ${fresh[0].title}`, 'remind');
  mascot.hold({ count, title: fresh[fresh.length - 1].title });
  play('click', 0.8);
  document.querySelectorAll('.bell').forEach(b => { b.classList.remove('ring'); void b.offsetWidth; b.classList.add('ring'); });
}

let lastCount = null;
export function paintBadges() {
  const n = dueReminders().length, txt = n > 99 ? '99+' : String(n);
  const grew = lastCount !== null && n > lastCount;
  lastCount = n;
  document.querySelectorAll('[data-rcount]').forEach(b => {
    b.textContent = txt; b.hidden = !n;
    if (grew) { b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop'); }
  });
  document.querySelectorAll('.bell').forEach(b => b.classList.toggle('has-due', !!n));
  // he only holds a card while something is due; keep its count in step
  if (!n) mascot.release();
  else if (mascot.holding()) { const d = dueReminders(); mascot.hold({ count: n, title: d[d.length - 1].title }); }
  document.title = n ? `(${txt}) ${baseTitle}` : baseTitle;
  N.setBadge(n);
}

// keep the service worker's copy of the schedule in step with the app
function mirror() {
  const items = upcomingReminders().concat(dueReminders()).map(q => ({ id: q.id, title: q.title, at: q.remind.at, body: body(q, 1) }));
  const sig = JSON.stringify(items);
  if (sig === lastSchedule) return;
  lastSchedule = sig;
  N.syncSchedule(items);
}

// Done / Snooze tapped on a notification
export function handleAction(action, id) {
  const q = findQuest(id); if (!q) return;
  if (action === 'done' && !q.done) { toggleDone(id); toast(`Done: ${q.title}`); }
  if (action === 'snooze') { snooze(id); toast(`Snoozed: ${q.title}`); }
}

export async function startReminders() {
  // apply anything that happened while the app was closed
  const { shown, actions } = await N.drainFromSW();
  if (shown.length) {
    const set = new Set(shown);
    commit(s => { for (const q of s.quests) if (q.remind && set.has(`${q.id}@${q.remind.at}`)) q.remind.fired = true; }, { quiet: true });
  }
  actions.forEach(a => handleAction(a.action, a.id));
  N.onMessage(m => {
    if (m && m.type === 'reminder-action') handleAction(m.action, m.id);
    if (m && m.type === 'navigate') location.hash = m.url;
  });
  subscribe(() => { paintBadges(); mirror(); });
  paintBadges(); mirror();
  // reminders already due when the app opens: he's holding them
  const due = dueReminders(); if (due.length) setTimeout(() => mascot.hold({ count: due.length, title: due[due.length - 1].title }), 1500);
  check();
  setInterval(check, 1000);
  document.addEventListener('visibilitychange', check);
}
