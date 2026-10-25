// Ticking a quest done (or not done), with the sound and message that go with it.
import * as store from './store.js';
import { toast, play } from './ui.js';
import { fmtDate, todayStr as fmtToday } from './dates.js';
import { summary } from './stats.js';
import { mascot } from './mascot.js';
import { sfx } from './sound.js';
import { latePopup } from './latepop.js';

export function completeQuest(id) {
  const q = store.findQuest(id); if (!q) return;
  const before = summary(store.getState().history, [], store.getState().settings.target).todayCount;
  const r = store.toggleDone(id);
  // a weekly goal: each time counts, and going past the goal is a bonus
  if (r.goal) {
    const p = r.progress;
    play('tick');
    const msg = p.extra ? `Logged. ${p.count} this week, ${p.extra} extra. Amazing!` : p.met ? `Logged. Goal met: ${p.count} of ${p.target} this week.` : `Logged. ${p.count} of ${p.target} this week.`;
    return toast(msg, p.met ? 'good' : undefined);
  }
  // a daily (or any repeating) quest is done once for its date: tapping again does nothing and counts nothing
  if (r.blocked) { play('tap', 0.6); return toast(`Already done for today. Next one: ${fmtDate(r.next)}`); }
  const st = store.getState();
  if (!r.done) { play('tap', 0.8); mascot.react('suspicious', 'hmm… sure?'); return toast('Marked as not done'); }
  const after = before + 1;
  // done late: still counts, for half the EXP, and a pop-up says so (with a wink); hitting the target still celebrates
  if (r.late) {
    latePopup(q);
    if (after !== st.settings.target) { play('tap', 0.8); mascot.react('suspicious', 'a bit late…'); return; }
  }
  const openToday = st.quests.filter(x => !x.done && x.due && x.due <= fmtToday()).length;
  // a quest that had steps: finishing the whole questline is a bigger moment than a single tick
  // reaching the daily target: a celebration sound, and Mochi jumps to say so (checked first, so it always happens)
  if (after === st.settings.target) {
    sfx('target');
    toast(`🎉 Daily target hit! ${after} of ${st.settings.target} done.`, 'good');
    mascot.react('startled-jump', "Congrats, you've reached your daily target!");
  }
  else if (q.subtasks?.length) { play('coin', 0.6); mascot.react('victory', 'questline done!'); }
  else {
    play('tick'); toast(r.next ? `Done. Next one: ${fmtDate(r.next)}` : `Done: ${q.title}`);
    if (!openToday) mascot.react('wipe', 'all clean!'); else mascot.celebrate(['nice!', 'yay!', 'one down'][Math.floor(Math.random() * 3)]);
  }
}
