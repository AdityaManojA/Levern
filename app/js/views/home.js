import { getState, sortQuests, dueReminders } from '../store.js';
import { summary, lastDays } from '../stats.js';
import { dueStatus, WEEKDAYS, fromStr } from '../dates.js';
import { esc } from '../ui.js';
import { questRow } from './common.js';
import { displayName } from '../account.js';

function greeting() { const h = new Date().getHours(); return h < 5 ? 'Up late' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; }

// a quiet line under Up next when it doesn't show every open quest: how many more, linking to them all
const moreLink = n => n > 0 ? `<a class="more-q" href="#/quests?filter=all" data-act="more-quests" role="button">+${n} more quest${n === 1 ? '' : 's'} ›</a>` : '';
export function render() {
  const st = getState(), s = st.settings, sum = summary(st.history, st.sessions, s.target, new Date(), st.quests);
  const open = st.quests.filter(q => !q.done);
  const overdue = open.filter(q => dueStatus(q) === 'overdue');
  const next = sortQuests(open, 'smart').slice(0, 5);
  const week = lastDays(st.history, st.sessions, s.target, 7);
  // Headroom above the target, so the dashed line never sits on the chart's top edge.
  const max = Math.max(s.target * 1.25, ...week.map(d => d.count));
  const left = Math.max(0, s.target - sum.todayCount);
  const rem = dueReminders().length;
  return `
    <div class="h-sub">${greeting()}${displayName(s) ? ', ' + esc(displayName(s)) : ''}</div>
    <h1 class="h-title">Up next</h1>
    <div class="sec sec-top"><span></span><a href="#/quests?filter=all" data-act="more-quests">All quests</a></div>
    ${next.length ? next.map(q => questRow(q)).join('') + moreLink(open.length - next.length) : `<div class="card empty"><span class="empty-mochi" data-sprite="box-peek" data-scale=".9"></span><b>All clear</b><span class="small">Add a quest with the + button.</span></div>`}
    <div class="statrow" aria-label="Today at a glance">
      <a class="mstat" href="#/stats" style="--acc:var(--sky)" aria-label="Today: ${sum.todayCount} of ${s.target}. Open your stats"><b>${sum.todayCount}/${s.target}</b><span>${left ? 'today' : 'target hit'}</span></a>
      <a class="mstat" href="#/stats" style="--acc:var(--coral)" aria-label="Streak: ${sum.current} days. Open your stats"><b>${sum.current}</b><span>day streak</span></a>
      <a class="mstat" href="#/leaderboard" data-tour="exp" style="--acc:var(--butter)" aria-label="${sum.exp} EXP. Open the leaderboard"><b>${sum.exp.toLocaleString()}</b><span>EXP</span></a>
      <a class="mstat" href="#/focus" style="--acc:var(--mint)" aria-label="${sum.todayFocus} minutes focused today. Open Focus"><b>${sum.todayFocus}m</b><span>focus</span></a>
    </div>
    ${overdue.length || rem ? `<div class="card alert">
      <h3>${overdue.length ? `${overdue.length} overdue quest${overdue.length === 1 ? '' : 's'}` : ''}${overdue.length && rem ? ' · ' : ''}${rem ? `${rem} reminder${rem === 1 ? '' : 's'} due` : ''}</h3>
      <div class="small">${overdue.length ? 'Finish them, or open one to move its date.' : 'Open the bell to finish, snooze or dismiss.'}</div>
      ${rem ? '<button class="mini" data-act="bell" style="margin-top:8px">Show reminders</button>' : ''}
    </div>` : ''}
    <div class="card" style="margin-top:12px">
      <h3>Daily target · this month</h3>
      <div class="small">You hit your ${s.target}-a-day target on ${sum.keptThisMonth} of ${sum.daysInMonthSoFar} days so far</div>
      <div class="bar"><i style="width:${Math.round(sum.keptThisMonth / sum.daysInMonthSoFar * 100)}%"></i></div>
    </div>
    <a class="card" href="#/stats" style="display:block;text-decoration:none">
      <h3>Quests done this week</h3>
      <div class="chart" style="height:90px">${week.map(d => `<b class="${d.count ? (d.count >= s.target ? 'hit' : '') : 'zero'}" style="height:${Math.max(4, d.count / max * 100)}%" title="${d.count} done"></b>`).join('')}
        <div class="target" style="bottom:${s.target / max * 100}%"></div></div>
      <div class="chart-l">${week.map(d => `<span>${WEEKDAYS[fromStr(d.date).getDay()][0]}</span>`).join('')}</div>
    </a>
    <a class="card" href="#/focus" style="display:flex;align-items:center;justify-content:space-between;text-decoration:none">
      <span><h3>Focus timer</h3><span class="small">${st.timer ? esc(st.timer.mode === 'focus' ? 'A focus session is running' : 'On a break') : `${s.focusMin} min sessions earn EXP`}</span></span><span class="btn sm">Open</span>
    </a>`;
}
