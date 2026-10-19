// Ticking a quest done (or not done), with the sound and message that go with it.
import * as store from './store.js';
import { toast, play } from './ui.js';
import { fmtDate } from './dates.js';
import { summary } from './stats.js';

export function completeQuest(id) {
  const q = store.findQuest(id); if (!q) return;
  const before = summary(store.getState().history, [], store.getState().settings.target).todayCount;
  const r = store.toggleDone(id);
  const st = store.getState();
  if (!r.done) { play('click', 0.6); return toast('Marked as not done'); }
  const after = before + 1;
  if (after === st.settings.target) { play('coin'); toast(`🎉 Daily target hit! ${after} of ${st.settings.target} done.`, 'good'); }
  else { play('click'); toast(r.next ? `Done. Next one: ${fmtDate(r.next)}` : `Done: ${q.title}`); }
}
