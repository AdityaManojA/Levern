// Quests list: filters (Today / Upcoming / Someday / Done / All), sorting and search.
import { getState, sortQuests, SORTS } from '../store.js';
import { dueStatus } from '../dates.js';
import { swap, morph } from '../motion.js';
import { esc } from '../ui.js';
import { questRow } from './common.js';
import { extractTags } from '../parse.js';

const FILTERS = [['today', 'Today'], ['upcoming', 'Upcoming'], ['someday', 'Someday'], ['done', 'Done'], ['all', 'All']];
let filter = 'today', sort = 'smart', query = '', activeTag = null;

export function matchQuest(q, qQuery = '', qTag = null) {
  const title = q?.title || '';
  const notes = q?.notes || '';
  const subtasks = (q?.subtasks || []).map(s => s?.title || '').join(' ');
  const sketches = (q?.sketches || []).map(k => k?.text || '').join(' ');
  const fullText = (title + ' ' + notes + ' ' + subtasks + ' ' + sketches).toLowerCase();

  if (qTag) {
    const qTags = extractTags(title + ' ' + notes);
    if (!qTags.includes(qTag.toLowerCase())) return false;
  }
  if (qQuery && !fullText.includes(qQuery.toLowerCase())) return false;
  return true;
}

const match = q => matchQuest(q, query, activeTag);
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
  if (params.tag !== undefined) activeTag = params.tag ? params.tag.toLowerCase() : null;
  const all = getState().quests.filter(match);
  const list = sortQuests(all.filter(q => inFilter(q, filter)), sort);
  if (filter === 'done') list.sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));
  let body;
  if (!list.length) {
    body = `<div class="card empty">${query ? '' : '<span class="empty-mochi" data-sprite="box-peek" data-scale=".9"></span>'}<b>${query ? 'No matches' : { today: 'Nothing due today', upcoming: 'Nothing scheduled', someday: 'No someday quests', done: 'Nothing done yet', all: 'No quests yet' }[filter]}</b>
      <span class="small">${query ? 'Try another word.' : 'Tap + to add one. Try "Call mum tomorrow at 6pm".'}</span></div>`;
  } else if (filter === 'today' && sort === 'smart') {
    const od = list.filter(q => dueStatus(q) === 'overdue'), td = list.filter(q => dueStatus(q) !== 'overdue');
    body = (od.length ? `<div class="group-h red" data-key="g-od">Overdue · ${od.length}</div>${od.map(q => questRow(q)).join('')}` : '') +
      (td.length ? `<div class="group-h" data-key="g-td">Due today · ${td.length}</div>${td.map(q => questRow(q)).join('')}` : '');
  } else body = list.map(q => questRow(q)).join('');
  const allQuests = getState().quests;
  const tagCounts = new Map();
  for (const item of allQuests) {
    for (const t of extractTags(item.title + ' ' + (item.notes || ''))) {
      tagCounts.set(t, (tagCounts.get(t) || 0) + 1);
    }
  }
  const uniqueTags = [...tagCounts.entries()].sort((a, b) => b[1] - a[1]);
  const tagBar = uniqueTags.length ? `<div class="tag-bar" role="tablist" aria-label="Tags">
    <button type="button" class="chip tag-pill${!activeTag ? ' on' : ''}" data-act="tag-select" data-tag="">All</button>
    ${uniqueTags.map(([t, n]) => `<button type="button" class="chip tag-pill${activeTag === t ? ' on' : ''}" data-act="tag-select" data-tag="${t}">#${t} <span class="n">${n}</span></button>`).join('')}
  </div>` : '';

  const count = f => all.filter(q => inFilter(q, f)).length;
  return `
    <div class="quests-pinned">
      <div class="h-sub">Your tasks. Tap one to open it, hold to edit.</div>
      <h1 class="h-title">Quests</h1>
      <div class="seg" role="tablist">${FILTERS.map(([k, l]) => `<button role="tab" aria-selected="${k === filter}" class="${k === filter ? 'on' : ''}" data-act="filter" data-f="${k}">${l}<span class="n">${count(k)}</span></button>`).join('')}</div>
      ${tagBar}
      <div class="toolbar">
        <input class="search" type="search" placeholder="Search quests" value="${esc(query)}" data-input="search" aria-label="Search quests">
        <select class="field" style="width:auto" data-change="sort" aria-label="Sort">${Object.entries(SORTS).map(([k, l]) => `<option value="${k}" ${k === sort ? 'selected' : ''}>${l}</option>`).join('')}</select>
      </div>
    </div>
    <div id="qlist" class="quests-scroll">${body}</div>`;
}

export const actions = {
  filter: el => {
    filter = el.dataset.f;
    const ql = document.getElementById('qlist');
    if (ql) ql.scrollTop = 0;
    rerender(true);
  },
  'tag-select': el => {
    activeTag = el.dataset.tag || null;
    const ql = document.getElementById('qlist');
    if (ql) ql.scrollTop = 0;
    rerender(true);
  },
  'tag-click': (el, ev) => {
    ev?.stopPropagation();
    activeTag = el.dataset.tag || null;
    const ql = document.getElementById('qlist');
    if (ql) ql.scrollTop = 0;
    rerender(true);
  },
};
export function onChange(el) { if (el.dataset.change === 'sort') { sort = el.value; rerender(); } }
let searchDebounce = null;
export function onInput(el) {
  if (el.dataset.input !== 'search') return;
  query = el.value;
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(() => {
    // re-render the list only, so the search box keeps focus
    const tmp = document.createElement('div'); tmp.innerHTML = render({});
    const view = document.getElementById('view');
    const curList = document.getElementById('qlist');
    const newList = tmp.querySelector('#qlist');
    if (view && curList && newList) {
      morph(view, () => curList.replaceWith(newList));
      document.querySelectorAll('.seg .n').forEach((n, i) => {
        const fresh = tmp.querySelectorAll('.seg .n')[i];
        if (fresh) n.textContent = fresh.textContent;
      });
    }
  }, 150);
}
function rerender(resetScroll = false) {
  const ql = document.getElementById('qlist');
  const sy = (!resetScroll && ql) ? ql.scrollTop : 0;
  swap(render({}));
  const fresh = document.getElementById('qlist');
  if (fresh && sy) fresh.scrollTop = sy;
}
