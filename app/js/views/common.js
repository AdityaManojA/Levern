// Pieces several screens share: the quest row, the priority picker and the reminder picker.
import { getState, tierLabel, TIER_COLORS, isReminderDue, reminderBase } from '../store.js';
import { dueLabel, dueStatus, relTime, fmtStamp, todayStr, addDays, at } from '../dates.js';
import { esc, ICON } from '../ui.js';
import { describe } from '../recur.js';

export function reminderChip(q) {
  if (!q.remind || q.done) return '';
  if (isReminderDue(q)) return '<span class="rchip due">🔔 due now</span>';
  if (q.remind.fired) return '';
  const soon = q.remind.at - Date.now() < 86400000;
  return `<span class="rchip">🔔 ${esc(soon ? relTime(q.remind.at) : fmtStamp(q.remind.at))}</span>`;
}

export function questRow(q, now = new Date()) {
  const st = dueStatus(q, now), subs = q.subtasks.length;
  const meta = [
    `<span>${esc(tierLabel(q.tier))}</span>`,
    q.due ? `<span class="${st === 'overdue' ? 'od' : ''}">${esc(dueLabel(q, now))}</span>` : '',
    q.repeat ? `<span class="tag">${ICON.repeat}${{ daily: 'daily', weekdays: 'weekdays', weekly: 'weekly', monthly: 'monthly' }[q.repeat.freq] || ''}</span>` : '',
    subs ? `<span>${q.subtasks.filter(s => s.done).length}/${subs} subtasks</span>` : '',
    q.sketches?.length ? `<span class="tag" title="Sketches">${ICON.sketch}${q.sketches.length}</span>` : '',
    reminderChip(q),
  ].join('');
  const open = expanded.has(q.id);
  // tap the quest to open it in place (subtasks, or its details); tap again to close; long-press or Edit to edit
  return `<div data-key="q-${q.id}" class="q${q.done ? ' done' : ''}${st === 'overdue' ? ' overdue' : ''}${isReminderDue(q) ? ' rdue' : ''}${open ? ' open' : ''}" style="--c:${TIER_COLORS[q.tier]}">
    <button class="chk" data-act="toggle" data-id="${q.id}" aria-label="${q.done ? 'Mark not done' : 'Complete'}: ${esc(q.title)}"></button>
    <button class="qb" data-act="expand" data-id="${q.id}" aria-expanded="${open}" aria-controls="qx-${q.id}" aria-description="Long-press to edit"><span class="qt">${esc(q.title)}</span><span class="qm">${meta}</span></button>
    <button class="qbell${q.remind && !q.done && !q.remind.dismissed ? ' set' : ''}" data-act="remind-edit" data-id="${q.id}" aria-label="Reminder for ${esc(q.title)}">${ICON.bell}</button>
    ${open ? questPanel(q, now) : ''}
  </div>`;
}

// which quests are open in place, kept across re-renders
export const expanded = new Set();

// the part that drops down under an open quest: its subtasks to tick, or (without any) its details
export function questPanel(q, now = new Date()) {
  const subs = q.subtasks || [];
  const info = [
    ['Priority', esc(tierLabel(q.tier))],
    q.due ? ['Due', esc(dueLabel(q, now))] : null,
    q.repeat ? ['Repeats', esc(describe(q.repeat))] : null,
    q.remind && !q.remind.dismissed && !q.done ? ['Reminder', esc(fmtStamp(q.remind.at))] : null,
    q.sketches?.length ? ['Sketches', `${q.sketches.length}`] : null,
  ].filter(Boolean);
  const notes = (q.notes || '').trim();
  return `<div class="qx" id="qx-${q.id}">
    ${subs.length ? `<div class="qx-subs" role="group" aria-label="Subtasks">${subs.map(s => `<button type="button" class="qx-sub${s.done ? ' done' : ''}" role="checkbox" aria-checked="${!!s.done}" data-act="sub-toggle" data-id="${q.id}" data-sid="${s.id}"><span class="qx-box" aria-hidden="true"></span><span>${esc(s.title)}</span></button>`).join('')}</div>` : ''}
    ${!subs.length || notes ? `<dl class="qx-info">${subs.length ? '' : info.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}${notes ? `<div class="qx-notes"><dt>Notes</dt><dd>${esc(notes.length > 280 ? notes.slice(0, 280) + '…' : notes)}</dd></div>` : ''}</dl>` : ''}
    <div class="qx-acts"><button type="button" class="mini" data-act="open" data-id="${q.id}">${ICON.pen} Edit</button>${subs.length ? `<span class="small">${subs.filter(s => s.done).length} of ${subs.length} done</span>` : ''}</div>
  </div>`;
}

export function tierPicker(sel) {
  return `<div class="pick" role="radiogroup" aria-label="Priority">${TIER_COLORS.map((c, i) =>
    `<button type="button" role="radio" aria-checked="${i === sel}" data-tier="${i}" class="${i === sel ? 'on' : ''}" style="--c:${c}" title="${esc(tierLabel(i))}">P${i + 1}</button>`).join('')}</div>
    <div class="small" style="margin-top:6px">${esc(tierLabel(sel))}</div>`;
}

/* ---------- reminder picker ----------
   Relative options need a due date (they move with it and repeat with it). */
const REL = [['r0', 'At due time', 0], ['r15', '15 min before', 15], ['r60', '1 hour before', 60], ['r1d', '1 day before', 1440]];
const ABS = [['a10', 'In 10 min', () => Date.now() + 10 * 60000], ['a60', 'In 1 hour', () => Date.now() + 3600000],
  ['tonight', 'Tonight 8 pm', () => { const t = at(todayStr(), '20:00'); return t > Date.now() ? t : at(addDays(todayStr(), 1), '20:00'); }],
  ['tom9', 'Tomorrow 9 am', () => at(addDays(todayStr(), 1), '09:00')]];
const localInput = ms => { const d = new Date(ms - new Date(ms).getTimezoneOffset() * 60000); return d.toISOString().slice(0, 16); };

// which option matches the current reminder
function selected(q) {
  if (!q.remind || q.remind.dismissed) return 'none';
  if (q.remind.offset != null) { const r = REL.find(x => x[2] * 60000 === q.remind.offset); if (r) return r[0]; }
  return 'custom';
}
export function reminderPicker(q, sel = selected(q)) {
  const opts = [['none', 'None'], ...(q.due ? REL : []), ...ABS, ['custom', 'Pick a time']];
  const base = q.remind && !q.remind.dismissed ? q.remind.at : (q.due ? reminderBase(q) : Date.now() + 3600000);
  return `<div class="ropts" data-ropts>${opts.map(([k, l]) => `<button type="button" data-r="${k}" class="${k === sel ? 'on' : ''}">${l}</button>`).join('')}</div>
    <div class="rcustom" ${sel === 'custom' ? '' : 'hidden'}><input class="field" type="datetime-local" data-rcustom value="${localInput(base)}"></div>
    ${q.remind && !q.remind.dismissed && !q.done ? `<div class="small" style="margin-top:6px">${q.remind.fired ? 'Went off' : 'Reminds you'} ${esc(fmtStamp(q.remind.at))}${q.remind.fired ? '' : ` (${esc(relTime(q.remind.at))})`}</div>` : ''}`;
}
// read the picker: undefined = unchanged/incomplete, null = no reminder, else { at } or { offset }
export function readPicker(root, key) {
  if (key === 'none') return null;
  const rel = REL.find(r => r[0] === key); if (rel) return { offset: rel[2] * 60000 };
  const abs = ABS.find(r => r[0] === key); if (abs) return { at: abs[2]() };
  if (key === 'custom') { const v = root.querySelector('[data-rcustom]').value; const t = v ? new Date(v).getTime() : NaN; return isNaN(t) ? undefined : { at: t }; }
  return undefined;
}
// wire a picker inside root; onPick(spec) is called whenever a choice is complete
export function bindPicker(root, onPick) {
  root.addEventListener('click', e => {
    const b = e.target.closest('[data-ropts] button'); if (!b) return;
    const box = b.parentElement;
    box.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
    box.nextElementSibling.hidden = b.dataset.r !== 'custom';
    const spec = readPicker(root, b.dataset.r);
    if (spec !== undefined) onPick(spec, b.dataset.r);
  });
  root.addEventListener('change', e => {
    if (!e.target.matches('[data-rcustom]')) return;
    const spec = readPicker(root, 'custom'); if (spec) onPick(spec, 'custom');
  });
}
export const pickerKey = root => root.querySelector('[data-ropts] .on')?.dataset.r || 'none';
export { getState };
