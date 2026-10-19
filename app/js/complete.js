// Ticking a quest done (or not done), with the sound and message that go with it.
import * as store from './store.js';
import { toast, play } from './ui.js';
import { fmtDate, todayStr as fmtToday } from './dates.js';
import { summary } from './stats.js';
import { mascot } from './mascot.js';

export function completeQuest(id) {
  const q = store.findQuest(id); if (!q) return;
  const before = summary(store.getState().history, [], store.getState().settings.target).todayCount;
  const r = store.toggleDone(id);
  const st = store.getState();
  if (!r.done) { play('tap', 0.8); mascot.react('suspicious', 'hmm… sure?'); return toast('Marked as not done'); }
  const after = before + 1;
  const openToday = st.quests.filter(x => !x.done && x.due && x.due <= fmtToday()).length;
  if (after === st.settings.target) { play('tick'); setTimeout(() => play('coin'), 160); toast(`🎉 Daily target hit! ${after} of ${st.settings.target} done.`, 'good'); mascot.react('button', 'target hit!'); }
  else {
    play('tick'); toast(r.next ? `Done. Next one: ${fmtDate(r.next)}` : `Done: ${q.title}`);
    if (!openToday) mascot.react('wipe', 'all clean!'); else mascot.celebrate(['nice!', 'yay!', 'one down'][Math.floor(Math.random() * 3)]);
  }
}
