// Calendar: month and week views of due quests (repeating quests show every occurrence),
// plus export to Google / Apple / Outlook calendars.
import { getState, tierLabel, TIER_COLORS, sortQuests, eventTier, setEventTier } from '../store.js';
import { todayStr, addDays, startOfWeek, monthGrid, fromStr, toStr, WEEKDAYS, MONTHS, fmtDate, fmtTime, addMonths } from '../dates.js';
import { externalEvents } from '../calendars.js';
import { occurrences } from '../recur.js';
import { buildICS } from '../ics.js';
import { swap } from '../motion.js';
import { esc, ICON, download, toast, play, sheet } from '../ui.js';

let mode = 'month', cursor = todayStr(), selected = todayStr();
let slide = 0;   // -1 / 1: the month just moved back / forward, so the grid slides in from that side
let quiet = false; // a re-draw for a tap on a day: update in place, no grid entrance
let showAll = false; // the day panel shows a few rows until asked for the rest
const PREVIEW = 4;

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

// the person's own Google Calendar events (from the Levern server), { 'YYYY-MM-DD': [event, ...] }
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
// a Google event looks like a quest: its priority colour once you give it one, Google blue until then
const EV_COLOR = 'var(--ev)';   // Google Calendar events (app.css --ev)
const evColor = e => { const t = eventTier(e.id); return t == null ? EV_COLOR : TIER_COLORS[t]; };
const G_TAG = '<span class="gtag" aria-label="Google Calendar">G</span>';
const evRow = (e, d, cls) => `<button type="button" class="${cls} ev" data-act="ev-open" data-ev="${esc(e.id)}" aria-label="${esc(e.title)}, Google Calendar event, ${esc(evTime(e, d))}${eventTier(e.id) != null ? `, ${esc(tierLabel(eventTier(e.id)))}` : ''}">
  <span class="dotc" style="--c:${evColor(e)}"></span><span class="t">${esc(e.title)}</span>${G_TAG}<span class="m">${esc(evTime(e, d))}</span></button>`;
const byTier = list => [...list].sort((a, b) => (eventTier(a.id) ?? 9) - (eventTier(b.id) ?? 9));

// one quest as a coloured row; the whole row opens the quest
const questRow = (q, key) => `<a data-key="${key}-${q.id}" class="dq${q.done ? ' is-done' : ''}" href="#/quest/${encodeURIComponent(q.id)}" style="--c:${TIER_COLORS[q.tier]}">
  <span class="t">${esc(q.title)}</span><span class="m">${q.time ? esc(fmtTime(q.time)) : ''}${q.repeat ? ' ↻' : ''}</span></a>`;

// the selected day: its quests and Google events, under the grid
function dayList(date, list, evs = []) {
  const d = fromStr(date), sub = `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
  return `<section class="card dayp" aria-live="polite">
    <header class="dayp-h"><div><b>${esc(fmtDate(date))}</b><small>${esc(sub)}</small></div>
      <button class="mini" data-act="add" data-due="${date}">+ Quest</button></header>
    ${list.length ? `<div class="dq-list">${(showAll ? list : list.slice(0, PREVIEW)).map(q => questRow(q, 'd')).join('')}</div>` : ''}
    ${list.length > PREVIEW && !showAll ? `<button class="dayp-more" data-act="cal-more">Show all ${list.length} quests</button>` : ''}
    ${!list.length && !evs.length ? '<p class="small dayp-empty">Nothing due. Tap <b>+ Quest</b> to plan something.</p>' : ''}
    ${evs.length ? `<div class="ev-h">From your Google Calendar · tap one to set its priority</div><div class="dq-list">${(showAll ? byTier(evs) : byTier(evs).slice(0, PREVIEW)).map(e => evRow(e, date, 'dq')).join('')}</div>` : ''}
    ${evs.length > PREVIEW && !showAll ? `<button class="dayp-more" data-act="cal-more">Show all ${evs.length} events</button>` : ''}
  </section>`;
}

export function render() {
  const today = todayStr(), enter = !quiet;
  quiet = false;
  let head, body;
  if (mode === 'month') {
    const c = fromStr(cursor), grid = monthGrid(c.getFullYear(), c.getMonth()), map = byDay(grid[0], grid[41]), evs = eventsByDay(grid[0], grid[41]);
    const mPrefix = cursor.slice(0, 7);
    head = `${MONTHS[c.getMonth()]} ${c.getFullYear()}`;
    const cls = ['month', enter && slide ? (slide > 0 ? 'from-r' : 'from-l') : '', enter ? 'enter' : ''].filter(Boolean).join(' ');
    body = `<div class="${cls}" data-tour="calendar">${['M', 'T', 'W', 'T', 'F', 'S', 'S'].map(d => `<div class="wd" aria-hidden="true">${d}</div>`).join('')}
      ${grid.map((d, i) => {
        const qs = map[d] || [], es = evs[d] || [];
        // quests and Google events together, most urgent first: up to three dots and a count, so every cell is the same size
        const all = [...qs.map(q => ({ c: TIER_COLORS[q.tier], t: q.tier })), ...es.map(e => ({ c: evColor(e), t: eventTier(e.id) ?? 6 }))].sort((a, b) => a.t - b.t);
        const dc = ['day', d.slice(0, 7) !== mPrefix ? 'out' : '', d === today ? 'today' : '', d === selected ? 'sel' : '', all.length ? 'has' : ''].filter(Boolean).join(' ');
        return `<button class="${dc}" style="--i:${i}" data-act="pick-day" data-d="${d}" aria-pressed="${d === selected}" aria-label="${esc(fmtDate(d))}, ${qs.length} quest${qs.length === 1 ? '' : 's'}${es.length ? `, ${es.length} Google event${es.length === 1 ? '' : 's'}` : ''}">
          <span class="dn">${fromStr(d).getDate()}</span>
          <span class="dots">${all.slice(0, 3).map(x => `<i style="--c:${x.c}"></i>`).join('')}</span></button>`;
      }).join('')}
    </div>
    ${dayList(selected, map[selected] || byDay(selected, selected)[selected] || [], evs[selected] || eventsByDay(selected, selected)[selected] || [])}`;
  } else {
    const start = startOfWeek(cursor), end = addDays(start, 6), map = byDay(start, end), evs = eventsByDay(start, end);
    const s = fromStr(start), e = fromStr(end);
    head = `${s.getDate()} ${MONTHS[s.getMonth()]} – ${e.getDate()} ${MONTHS[e.getMonth()]}`;
    body = `<div class="week${enter ? ' enter' : ''}" data-tour="calendar">${Array.from({ length: 7 }, (_, i) => addDays(start, i)).map((d, i) => {
      const qs = map[d] || [], es = evs[d] || [];
      return `<div class="wday${d === today ? ' today' : ''}" style="--i:${i}">
        <div class="wh"><span>${WEEKDAYS[fromStr(d).getDay()]} ${fromStr(d).getDate()}${d === today ? ' · Today' : ''}</span><button class="mini" data-act="add" data-due="${d}" aria-label="Add quest on ${esc(fmtDate(d))}">+</button></div>
        ${qs.map(q => questRow(q, `w-${d}`)).join('')}${byTier(es).map(e => evRow(e, d, 'dq')).join('')}${qs.length || es.length ? '' : '<div class="small wday-free">Free</div>'}
      </div>`;
    }).join('')}</div>`;
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
    <details class="card ics-card">
      <summary>Use your own calendar <span class="small">Apple, Outlook, Google</span></summary>
      <div class="small" style="margin:10px 0">Download every dated quest (${open}) as one calendar file, with repeats and reminders. Open it with Apple Calendar or Outlook, or import it in Google Calendar (Settings → Import). Each quest also has its own Google Calendar button.</div>
      <button class="btn white sm" data-act="ics-all" ${open ? '' : 'disabled'}>${ICON.download} Download .ics (${open})</button>
    </details>`;
}

// a Google event's sheet: when and where, a priority to pick, and a link to change it in Google.
// No delete: the event belongs to Google Calendar, and Levern never changes it there.
function openEvent(id) {
  const e = externalEvents().find(x => x.id === id);
  if (!e) return;
  const draw = () => {
    const t = eventTier(e.id), d = e.allDay ? e.start : toStr(new Date(e.start));
    const when = e.allDay ? `${fmtDate(e.start)} · all day` : `${fmtDate(d)} · ${fmtTime(hhmm(e.start))}${e.end ? `–${fmtTime(hhmm(e.end))}` : ''}`;
    return `<div class="sheet-h"><b>${esc(e.title)}</b><button class="btn white sm" data-ev-close>Close</button></div>
      <div class="ev-when">${G_TAG}<span>${esc(when)}${e.where ? ` · ${esc(e.where)}` : ''}</span></div>
      <label class="lbl" id="ev-pri">Priority in Levern</label>
      <div class="pick" role="radiogroup" aria-labelledby="ev-pri">${TIER_COLORS.map((c, i) => `<button type="button" role="radio" aria-checked="${i === t}" data-ev-tier="${i}" class="${i === t ? 'on' : ''}" style="--c:${c}" title="${esc(tierLabel(i))}">P${i + 1}</button>`).join('')}</div>
      <div class="small" style="margin-top:6px">${t == null ? 'No priority yet. It shows in Google blue until you pick one.' : esc(tierLabel(t))}${t != null ? ' · <button type="button" class="link" data-ev-tier="none">Clear</button>' : ''}</div>
      <p class="small" style="margin:16px 0 10px">This event lives in your Google Calendar. Change its time or delete it there, and Levern follows.</p>
      ${e.url ? `<a class="btn white block" href="${esc(e.url)}" target="_blank" rel="noopener">Open in Google Calendar</a>` : ''}`;
  };
  const s = sheet.open(draw(), 'evsheet');
  s.onclick = ev => {
    const b = ev.target.closest('[data-ev-tier]');
    if (b) { setEventTier(e.id, b.dataset.evTier === 'none' ? null : +b.dataset.evTier); play('click', 0.5); s.innerHTML = `<div class="grab"></div>${draw()}`; return; }
    if (ev.target.closest('[data-ev-close]')) sheet.close();
  };
}

function moveBy(n) {
  slide = n; play('click', 0.3);
  cursor = mode === 'month' ? addMonths(cursor.slice(0, 8) + '01', n) : addDays(cursor, 7 * n);
  if (mode === 'month') selected = cursor.slice(0, 7) === todayStr().slice(0, 7) ? todayStr() : cursor;
  rerender();
}
function rerender(q = false) { quiet = q; swap(render({})); slide = 0; }

export const actions = {
  'ev-open': el => openEvent(el.dataset.ev),
  mode: el => { mode = el.dataset.m; play('click', 0.4); rerender(); },
  'pick-day': el => {
    selected = el.dataset.d; showAll = false; play('click', 0.35); rerender(true);
    // the picked day gives a small squash-and-spring, so the tap reads as landing
    document.querySelector('.day.sel')?.animate([{ transform: 'scale(.9)' }, { transform: 'scale(1.07)', offset: .55 }, { transform: 'none' }], { duration: 360, easing: 'cubic-bezier(.22,1,.36,1)' });
  },
  'cal-today': () => { cursor = selected = todayStr(); showAll = false; rerender(); },
  'cal-more': () => { showAll = true; play('click', 0.3); rerender(true); },
  'cal-move': el => moveBy(+el.dataset.n),
  'ics-all': () => { download('taskflow.ics', buildICS(getState().quests), 'text/calendar'); toast('Calendar file saved'); },
};

// swipe sideways across the month to go to the next or previous month
let swipeFrom = null;
document.addEventListener('pointerdown', e => { swipeFrom = e.target.closest?.('.month') ? { x: e.clientX, y: e.clientY } : null; }, { passive: true });
document.addEventListener('pointerup', e => {
  const f = swipeFrom; swipeFrom = null;
  if (!f || mode !== 'month') return;
  const dx = e.clientX - f.x, dy = e.clientY - f.y;
  if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.6) moveBy(dx < 0 ? 1 : -1);
}, { passive: true });
document.addEventListener('pointercancel', () => { swipeFrom = null; }, { passive: true });
