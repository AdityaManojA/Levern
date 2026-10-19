// Stats & history: totals, streaks, the last 30 days, priorities, focus, and every completed quest.
import { getState, TIER_COLORS } from '../store.js';
import { summary, lastDays, historyDay } from '../stats.js';
import { fromStr, fmtDate, fmtTime, WEEKDAYS } from '../dates.js';
import { esc } from '../ui.js';

let range = 30, showAll = false;

export function render() {
  const st = getState(), s = st.settings, sum = summary(st.history, st.sessions, s.target);
  const days = lastDays(st.history, st.sessions, s.target, range);
  const max = Math.max(s.target, ...days.map(d => d.count), 1);
  const tierMax = Math.max(1, ...sum.tiers);
  const focus7 = lastDays(st.history, st.sessions, s.target, 7);
  const fmax = Math.max(25, ...focus7.map(d => d.focus));
  const hist = st.history.slice().sort((a, b) => b.doneAt - a.doneAt);
  const shown = showAll ? hist : hist.slice(0, 25);
  let lastDay = '';
  const label = (d, i) => range === 7 ? WEEKDAYS[fromStr(d).getDay()][0] : (i % 5 === 4 || i === days.length - 1 ? fromStr(d).getDate() : '');
  return `
    <div class="h-sub">How you're doing</div>
    <h1 class="h-title">Stats</h1>
    <div class="grid2 grid4">
      <div class="stat" style="background:var(--mint)"><div class="k">Quests done</div><div class="v">${sum.totalDone}</div><div class="s">all time</div></div>
      <div class="stat" style="background:var(--coral)"><div class="k">Streak</div><div class="v">${sum.current}</div><div class="s">best ${sum.best} day${sum.best === 1 ? '' : 's'}</div></div>
      <div class="stat" style="background:var(--butter)"><div class="k">EXP</div><div class="v">${sum.exp.toLocaleString()}</div><div class="s">+${sum.todayExp} today</div></div>
      <div class="stat" style="background:var(--sky)"><div class="k">Focus</div><div class="v">${Math.floor(sum.focusMin / 60)}h ${sum.focusMin % 60}m</div><div class="s">all time</div></div>
    </div>
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center"><h3>Quests per day</h3>
        <div class="seg" style="margin:0;width:auto"><button class="${range === 7 ? 'on' : ''}" data-act="range" data-n="7" style="padding:4px 10px">7 d</button><button class="${range === 30 ? 'on' : ''}" data-act="range" data-n="30" style="padding:4px 10px">30 d</button></div></div>
      <div class="chart">${days.map(d => `<b class="${d.count ? (d.count >= s.target ? 'hit' : '') : 'zero'}" style="height:${Math.max(3, d.count / max * 100)}%" title="${esc(fmtDate(d.date))}: ${d.count} done, ${d.exp} EXP"></b>`).join('')}
        <div class="target" style="bottom:${s.target / max * 100}%" title="Daily target"></div></div>
      <div class="chart-l">${days.map((d, i) => `<span>${label(d.date, i)}</span>`).join('')}</div>
      <div class="small" style="margin-top:8px">Yellow bars hit your daily target of ${s.target}. The dashed line is the target.</div>
    </div>
    <div class="card">
      <h3>Daily target this month</h3>
      <div class="small">Kept on ${sum.keptThisMonth} of ${sum.daysInMonthSoFar} days so far</div>
      <div class="bar"><i style="width:${Math.round(sum.keptThisMonth / sum.daysInMonthSoFar * 100)}%"></i></div>
    </div>
    <div class="card tiers">
      <h3>Done by priority</h3>
      ${sum.tiers.map((n, i) => `<div class="tr"><span>P${i + 1}</span><div class="bar"><i style="width:${n / tierMax * 100}%;--c:${TIER_COLORS[i]}"></i></div><span style="width:28px;text-align:right">${n}</span></div>`).join('')}
    </div>
    <div class="card">
      <h3>Focus, last 7 days</h3>
      <div class="chart" style="height:80px">${focus7.map(d => `<b class="${d.focus ? '' : 'zero'}" style="height:${Math.max(3, d.focus / fmax * 100)}%;background:var(--sky)" title="${d.focus} min"></b>`).join('')}</div>
      <div class="chart-l">${focus7.map(d => `<span>${WEEKDAYS[fromStr(d.date).getDay()][0]}</span>`).join('')}</div>
    </div>
    <div class="sec">History ${hist.length ? `<span class="small">${hist.length} completed</span>` : ''}</div>
    <div class="card">
      ${shown.length ? shown.map(h => { const d = historyDay(h), head = d !== lastDay ? `<div class="group-h" style="margin-top:${lastDay ? 12 : 2}px">${esc(fmtDate(d))}</div>` : ''; lastDay = d;
        const t = new Date(h.doneAt);
        return head + `<div class="hist"><span><span class="dotc" style="--c:${TIER_COLORS[h.tier ?? 3]};display:inline-block;vertical-align:-1px;margin-right:6px"></span>${esc(h.title)}</span><span class="small">${fmtTime(`${t.getHours()}:${String(t.getMinutes()).padStart(2, '0')}`)}</span></div>`; }).join('')
        : '<div class="empty"><b>No history yet</b><span class="small">Every quest you finish shows up here.</span></div>'}
      ${hist.length > 25 && !showAll ? `<button class="btn white sm block" data-act="hist-all" style="margin-top:10px">Show all ${hist.length}</button>` : ''}
    </div>`;
}
export const actions = {
  range: el => { range = +el.dataset.n; rerender(); },
  'hist-all': () => { showAll = true; rerender(); },
};
function rerender() { const y = scrollY; document.getElementById('view').innerHTML = render(); scrollTo(0, y); }
