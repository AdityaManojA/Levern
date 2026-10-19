// Calendar: week and month views of due quests (repeating quests show every occurrence),
// plus export to Google / Apple / Outlook calendars.
import { getState, tierLabel, TIER_COLORS, sortQuests } from '../store.js';
import { todayStr, addDays, startOfWeek, monthGrid, fromStr, toStr, WEEKDAYS, MONTHS, fmtDate, fmtTime, addMonths } from '../dates.js';
import { externalEvents } from '../calendars.js';
import { occurrences } from '../recur.js';
import { buildICS } from '../ics.js';
import { swap } from '../motion.js';
import { esc, ICON, download, toast, play } from '../ui.js';

let mode = 'month', cursor = todayStr(), selected = todayStr();

// { 'YYYY-MM-DD': [quest, ...] } for open quests in the range
function byDay(from, to) {
  const map = {};
  for (const q of getState().quests) {
    if (q.done && !q.repeat) { if (q.due >= from && q.due <= to) (map[q.due] ||= []).push(q); continue; }
    for (const d of occurrences(q, from, to)) (map[d] ||= []).push(q);
  }
  for (const k in map) map[k] = sortQuests(map[k], 'priority');
  return map;
}

// the person's own Google Calendar events (from the TaskFlow server), { 'YYYY-MM-DD': [event, ...] }
const pad = n => String(n).padStart(2, '0');
const hhmm = iso => { const d = new Date(iso); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
function eventsByDay(from, to) {
  const map = {};
  for (const e of externalEvents()) {
    if (!e.start) continue;
    let d = e.allDay ? e.start : toStr(new Date(e.start));
    const last = e.allDay ? addDays(e.end || addDays(e.start, 1), -1) : toStr(new Date(e.end || e.start));
    for (let i = 0; d <= last && i < 31; d = addDays(d, 1), i++) if (d >= from && d <= to) (map[d] ||= []).push(e);
  }
  for (const k in map) map[k].sort((a, b) => (a.allDay ? 0 : 1) - (b.allDay ? 0 : 1) || String(a.start).localeCompare(String(b.start)));
  return map;
}
const evTime = (e, d) => e.allDay ? 'All day' : toStr(new Date(e.start)) === d ? fmtTime(hhmm(e.start)) : 'cont.';
const evRow = (e, d, cls) => `<a class="${cls} ev" href="${esc(e.url || '#')}" target="_blank" rel="noopener" title="${esc(e.where ? `${e.title} · ${e.where}` : e.title)}"><span class="dotc ev-dot"></span><span class="t">${esc(e.title)}</span><span class="small">${esc(evTime(e, d))}</span></a>`;

function dayList(date, list, evs = []) {
  return `<div class="card">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><h3>${esc(fmtDate(date))}${date !== todayStr() && fmtDate(date) !== 'Tomorrow' && fmtDate(date) !== 'Yesterday' ? '' : ` · ${WEEKDAYS[fromStr(date).getDay()]} ${fromStr(date).getDate()} ${MONTHS[fromStr(date).getMonth()]}`}</h3>
      <button class="mini" data-act="add" data-due="${date}">+ Quest</button></div>
    ${list.length ? list.map(q => `<a data-key="d-${q.id}" class="wday-q wq" href="#/quest/${encodeURIComponent(q.id)}" style="display:flex;align-items:center;gap:8px;margin-top:8px;text-decoration:none;font-weight:600;${q.done ? 'opacity:.55;text-decoration:line-through' : ''}">
        <span class="dotc" style="--c:${TIER_COLORS[q.tier]}"></span><span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(q.title)}</span>
        <span class="small">${q.time ? esc(fmtTime(q.time)) : ''}${q.repeat ? ' ↻' : ''}</span></a>`).join('') : `<div class="small" style="margin-top:6px">${evs.length ? 'No quests due.' : 'Nothing due. Tap + Quest to plan something.'}</div>`}
    ${evs.length ? `<div class="ev-h">From your Google Calendar</div>${evs.map(e => evRow(e, date, 'wday-q wq')).join('')}` : ''}
  </div>`;
}

export function render() {
  const today = todayStr();
  let head, body;
  if (mode === 'month') {
    const c = fromStr(cursor), grid = monthGrid(c.getFullYear(), c.getMonth()), map = byDay(grid[0], grid[41]), evs = eventsByDay(grid[0], grid[41]);
    const mPrefix = cursor.slice(0, 7);
    head = `${MONTHS[c.getMonth()]} ${c.getFullYear()}`;
    body = `<div class="month" data-tour="calendar">${['M', 'T', 'W', 'T', 'F', 'S', 'S'].map(d => `<div class="wd">${d}</div>`).join('')}
      ${grid.map(d => { const qs = map[d] || [], es = evs[d] || [], room = Math.max(0, 4 - Math.min(es.length, 1));
        return `<button class="day${d.slice(0, 7) !== mPrefix ? ' out' : ''}${d === today ? ' today' : ''}${d === selected ? ' sel' : ''}" data-act="pick-day" data-d="${d}" aria-label="${esc(fmtDate(d))}, ${qs.length} quests${es.length ? `, ${es.length} events` : ''}">
          ${fromStr(d).getDate()}<span class="dots">${qs.slice(0, room).map(q => `<i style="--c:${TIER_COLORS[q.tier]}"></i>`).join('')}${es.length ? '<i class="ev-dot"></i>' : ''}${qs.length > room ? `<span class="more">+${qs.length - room}</span>` : ''}</span></button>`; }).join('')}
    </div>
    <div style="height:12px"></div>${dayList(selected, map[selected] || byDay(selected, selected)[selected] || [], evs[selected] || eventsByDay(selected, selected)[selected] || [])}`;
  } else {
    const start = startOfWeek(cursor), end = addDays(start, 6), map = byDay(start, end), evs = eventsByDay(start, end);
    const s = fromStr(start), e = fromStr(end);
    head = `${s.getDate()} ${MONTHS[s.getMonth()]} – ${e.getDate()} ${MONTHS[e.getMonth()]}`;
    body = `<div class="week" data-tour="calendar">${Array.from({ length: 7 }, (_, i) => addDays(start, i)).map(d => { const qs = map[d] || [];
      return `<div class="wday${d === today ? ' today' : ''}">
        <div class="wh"><span>${WEEKDAYS[fromStr(d).getDay()]} ${fromStr(d).getDate()}${d === today ? ' · Today' : ''}</span><button class="mini" data-act="add" data-due="${d}" aria-label="Add quest on ${esc(fmtDate(d))}">+</button></div>
        ${qs.map(q => `<a data-key="w-${d}-${q.id}" class="wq" href="#/quest/${encodeURIComponent(q.id)}" style="${q.done ? 'opacity:.55;text-decoration:line-through' : ''}"><span class="dotc" style="--c:${TIER_COLORS[q.tier]}"></span><span class="t">${esc(q.title)}</span><span class="small">${q.time ? esc(fmtTime(q.time)) : ''}${q.repeat ? ' ↻' : ''}</span></a>`).join('')}${(evs[d] || []).map(e => evRow(e, d, 'wq')).join('')}${qs.length || evs[d]?.length ? '' : '<div class="small" style="margin-top:4px">Free</div>'}
      </div>`; }).join('')}</div>`;
  }
  const open = getState().quests.filter(q => q.due && !q.done).length;
  return `
    <div class="h-sub">What's due when</div>
    <h1 class="h-title">Calendar</h1>
    <div class="seg"><button class="${mode === 'week' ? 'on' : ''}" data-act="mode" data-m="week">Week</button><button class="${mode === 'month' ? 'on' : ''}" data-act="mode" data-m="month">Month</button></div>
    <div class="cal-h"><b>${head}</b><span class="navs">
      <button class="iconbtn" data-act="cal-move" data-n="-1" aria-label="Previous">${ICON.left}</button>
      <button class="mini" data-act="cal-today">Today</button>
      <button class="iconbtn" data-act="cal-move" data-n="1" aria-label="Next">${ICON.right}</button></span></div>
    ${body}
    <div class="sec">Use your own calendar</div>
    <div class="card">
      <div class="small" style="margin-bottom:10px">Download every dated quest (${open}) as one calendar file, with repeats and reminders. Open it with Apple Calendar or Outlook, or import it in Google Calendar (Settings → Import). Each quest also has its own Google Calendar button.</div>
      <button class="btn white sm" data-act="ics-all" ${open ? '' : 'disabled'}>${ICON.download} Download .ics (${open})</button>
    </div>`;
}

export const actions = {
  mode: el => { mode = el.dataset.m; play('click', 0.4); rerender(); },
  'pick-day': el => { selected = el.dataset.d; rerender(); },
  'cal-today': () => { cursor = selected = todayStr(); rerender(); },
  'cal-move': el => {
    const n = +el.dataset.n;
    cursor = mode === 'month' ? addMonths(cursor.slice(0, 8) + '01', n) : addDays(cursor, 7 * n);
    if (mode === 'month') selected = cursor.slice(0, 7) === todayStr().slice(0, 7) ? todayStr() : cursor;
    rerender();
  },
  'ics-all': () => { download('taskflow.ics', buildICS(getState().quests), 'text/calendar'); toast('Calendar file saved'); },
};
function rerender() { swap(render({})); }
