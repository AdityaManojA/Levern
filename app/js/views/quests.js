// Quests list: filters (Today / Upcoming / Someday / Done / All), sorting and search.
import { getState, sortQuests, SORTS } from '../store.js';
import { dueStatus } from '../dates.js';
import { esc } from '../ui.js';
import { questRow } from './common.js';

const FILTERS = [['today', 'Today'], ['upcoming', 'Upcoming'], ['someday', 'Someday'], ['done', 'Done'], ['all', 'All']];
let filter = 'today', sort = 'smart', query = '';

const match = q => !query || (q.title + ' ' + q.notes + ' ' + q.subtasks.map(s => s.title).join(' ')).toLowerCase().includes(query.toLowerCase());
const inFilter = (q, f) => {
  const st = dueStatus(q);
  if (f === 'done') return q.done;
  if (q.done) return f === 'all';
  if (f === 'today') return st === 'overdue' || st === 'today';
  if (f === 'upcoming') return q.due && !['overdue', 'today'].includes(st);
  if (f === 'someday') return !q.due;
  return true;
};

export function render(params) {
  if (params.filter && FILTERS.some(f => f[0] === params.filter)) filter = params.filter;
  const all = getState().quests.filter(match);
  const list = sortQuests(all.filter(q => inFilter(q, filter)), sort);
  if (filter === 'done') list.sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));
  let body;
  if (!list.length) {
    body = `<div class="card empty"><b>${query ? 'No matches' : { today: 'Nothing due today', upcoming: 'Nothing scheduled', someday: 'No someday quests', done: 'Nothing done yet', all: 'No quests yet' }[filter]}</b>
      <span class="small">${query ? 'Try another word.' : 'Tap + to add one. Try "Call mum tomorrow at 6pm".'}</span></div>`;
  } else if (filter === 'today' && sort === 'smart') {
    const od = list.filter(q => dueStatus(q) === 'overdue'), td = list.filter(q => dueStatus(q) !== 'overdue');
    body = (od.length ? `<div class="group-h red">Overdue · ${od.length}</div>${od.map(q => questRow(q)).join('')}` : '') +
      (td.length ? `<div class="group-h">Due today · ${td.length}</div>${td.map(q => questRow(q)).join('')}` : '');
  } else body = list.map(q => questRow(q)).join('');
  const count = f => all.filter(q => inFilter(q, f)).length;
  return `
    <div class="h-sub">Your tasks. Tap one for details.</div>
    <h1 class="h-title">Quests</h1>
    <div class="seg" role="tablist">${FILTERS.map(([k, l]) => `<button role="tab" aria-selected="${k === filter}" class="${k === filter ? 'on' : ''}" data-act="filter" data-f="${k}">${l}<span class="n">${count(k)}</span></button>`).join('')}</div>
    <div class="toolbar">
      <input class="search" type="search" placeholder="Search quests" value="${esc(query)}" data-input="search" aria-label="Search quests">
      <select class="field" style="width:auto" data-change="sort" aria-label="Sort">${Object.entries(SORTS).map(([k, l]) => `<option value="${k}" ${k === sort ? 'selected' : ''}>${l}</option>`).join('')}</select>
    </div>
    <div id="qlist">${body}</div>`;
}

export const actions = {
  filter: el => { filter = el.dataset.f; rerender(); },
};
export function onChange(el) { if (el.dataset.change === 'sort') { sort = el.value; rerender(); } }
export function onInput(el) {
  if (el.dataset.input !== 'search') return;
  query = el.value;
  // re-render the list only, so the search box keeps focus
  const tmp = document.createElement('div'); tmp.innerHTML = render({});
  document.getElementById('qlist').replaceWith(tmp.querySelector('#qlist'));
  document.querySelectorAll('.seg .n').forEach((n, i) => { n.textContent = tmp.querySelectorAll('.seg .n')[i].textContent; });
}
function rerender() { const y = scrollY; document.getElementById('view').innerHTML = render({}); scrollTo(0, y); }
