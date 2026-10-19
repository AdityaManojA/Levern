import { getState, sortQuests, dueReminders } from '../store.js';
import { summary, lastDays } from '../stats.js';
import { dueStatus, WEEKDAYS, fromStr } from '../dates.js';
import { esc } from '../ui.js';
import { questRow } from './common.js';

function greeting() { const h = new Date().getHours(); return h < 5 ? 'Up late' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; }

export function render() {
  const st = getState(), s = st.settings, sum = summary(st.history, st.sessions, s.target);
  const open = st.quests.filter(q => !q.done);
  const overdue = open.filter(q => dueStatus(q) === 'overdue');
  const next = sortQuests(open, 'smart').slice(0, 5);
  const week = lastDays(st.history, st.sessions, s.target, 7);
  const max = Math.max(s.target, ...week.map(d => d.count));
  const left = Math.max(0, s.target - sum.todayCount);
  const rem = dueReminders().length;
  return `
    <div class="h-sub">${greeting()}</div>
    <h1 class="h-title">Your progress</h1>
    <div class="grid2 grid4">
      <a class="stat" href="#/stats" style="background:var(--sky)"><div class="k">Today</div><div class="v">${sum.todayCount} / ${s.target}</div><div class="s">${left ? `${left} more to hit your target` : 'target hit!'}</div></a>
      <a class="stat" href="#/stats" style="background:var(--coral)"><div class="k">Streak</div><div class="v">${sum.current}</div><div class="s">${sum.keptToday ? 'kept today' : 'days in a row'}</div></a>
      <a class="stat" href="#/stats" style="background:var(--butter)"><div class="k">EXP</div><div class="v">${sum.exp.toLocaleString()}</div><div class="s">+${sum.todayExp} today</div></a>
      <a class="stat" href="#/focus" style="background:var(--mint)"><div class="k">Focus</div><div class="v">${sum.todayFocus}m</div><div class="s">focused today</div></a>
    </div>
    ${overdue.length || rem ? `<div class="card alert">
      <h3>${overdue.length ? `${overdue.length} overdue quest${overdue.length === 1 ? '' : 's'}` : ''}${overdue.length && rem ? ' · ' : ''}${rem ? `${rem} reminder${rem === 1 ? '' : 's'} due` : ''}</h3>
      <div class="small">${overdue.length ? 'Finish them, or open one to move its date.' : 'Open the bell to finish, snooze or dismiss.'}</div>
      ${rem ? '<button class="mini" data-act="bell" style="margin-top:8px">Show reminders</button>' : ''}
    </div>` : ''}
    <div class="sec">Up next <a href="#/quests">All quests</a></div>
    ${next.length ? next.map(q => questRow(q)).join('') : `<div class="card empty"><b>All clear</b><span class="small">Add a quest with the + button.</span></div>`}
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
