// Pieces several screens share: the quest row, the priority picker and the reminder picker.
import { getState, tierLabel, TIER_COLORS, isReminderDue, reminderBase } from '../store.js';
import { dueLabel, dueStatus, relTime, fmtStamp, todayStr, addDays, at } from '../dates.js';
import { esc, ICON, toast } from '../ui.js';
import { describe, repeatShort } from '../recur.js';
import { PRESETS, MAX_ALERT, cleanAlerts, alertLabel, alertShort } from '../alerts.js';
import { goalProgress } from '../goals.js';
import { rankOf, rankLabel, masterLevel, RANKS } from '../stats.js';

// a weekly goal's progress for this week, e.g. "Goal 2/3 this week" (or "Goal met · +1 extra")
export function goalChip(q) {
  const p = goalProgress(q);
  const text = p.extra ? `Goal met · +${p.extra} extra` : p.met ? 'Goal met this week' : `${p.count}/${p.target} this week`;
  return `<span class="tag goal${p.met ? ' met' : ''}">${ICON.repeat}${esc(text)}</span>`;
}
// "Times a week" stepper on the new-quest sheet
export const goalStepper = target => `<div class="goalstep"><span class="small">Times a week</span>
  <button type="button" class="step-btn" data-goal-step="-1" aria-label="Fewer times">−</button><b>${target}×</b><button type="button" class="step-btn" data-goal-step="1" aria-label="More times">+</button></div>`;
// the goal's controls on the detail screen: the target, this week's progress, and undo
export function goalBlock(q) {
  const p = goalProgress(q);
  return `<div class="goalbox">
    <div class="srow"><div class="l"><b>Weekly goal</b><small>${p.extra ? `${p.count} this week: goal met, +${p.extra} extra` : `${p.count} of ${p.target} this week`}. Times past the goal count as extra.</small></div>
      <div class="step"><button data-act="goal-step" data-d="-1" aria-label="Fewer times">−</button><b>${p.target}×</b><button data-act="goal-step" data-d="1" aria-label="More times">+</button></div></div>
    <div class="row-btns"><button class="mini" data-act="goal-undo" data-id="${q.id}" ${p.count ? '' : 'disabled'}>Undo last time</button></div>
  </div>`;
}

// the app's own bell (same drawing as the top bar), small, instead of the 🔔 emoji
const BELL = '<svg class="rbell" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/></svg>';
export function reminderChip(q) {
  if (!q.remind || q.done) return '';
  if (isReminderDue(q)) return `<span class="rchip due">${BELL}due now</span>`;
  if (q.remind.fired) return '';
  const soon = q.remind.at - Date.now() < 86400000;
  return `<span class="rchip">${BELL}${esc(soon ? relTime(q.remind.at) : fmtStamp(q.remind.at))}</span>`;
}

export function questRow(q, now = new Date()) {
  const st = dueStatus(q, now), subs = q.subtasks.length;
  const meta = [
    `<span>${esc(tierLabel(q.tier))}</span>`,
    q.due ? `<span class="${st === 'overdue' ? 'od' : ''}">${esc(dueLabel(q, now))}</span>` : '',
    // right after the date, so it sits in the same place on every card
    reminderChip(q),
    q.repeat ? `<span class="tag">${ICON.repeat}${repeatShort(q.repeat)}</span>` : '',
    q.goal ? goalChip(q) : '',
    subs ? `<span>${q.subtasks.filter(s => s.done).length}/${subs} subtasks</span>` : '',
    q.sketches?.length ? `<span class="tag" title="Sketches">${ICON.sketch}${q.sketches.length}</span>` : '',
    q.sample ? '<span class="exchip" title="An example to show how TaskFlow works. It stays out of your calendar. Edit it to make it yours.">Example</span>' : '',
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
// the reminders a quest has: its alerts, or (older quests) the one reminder it had
export const alertsFor = q => Array.isArray(q.alerts) ? q.alerts : (q.remind && q.remind.offset != null ? [Math.round(q.remind.offset / 60000)] : []);

// a dated quest: any number of reminders before its due time (0 = at the due time). Tap presets, or add your own.
export function alertPicker(list) {
  const on = cleanAlerts(list);
  const custom = on.filter(m => !PRESETS.includes(m));
  return `<div class="alerts" data-alerts data-list="${esc(JSON.stringify(on))}">
    <div class="chips">${PRESETS.map(m => `<button type="button" class="chip-btn${on.includes(m) ? ' on' : ''}" data-alert="${m}" aria-pressed="${on.includes(m)}">${esc(alertShort(m))}${m ? ' before' : ''}</button>`).join('')}</div>
    <div class="alert-add">
      <input class="field" type="number" min="1" max="999" inputmode="numeric" value="1" data-alert-n aria-label="How many">
      <select class="field" data-alert-u aria-label="Unit"><option value="1">minutes</option><option value="60" selected>hours</option><option value="1440">days</option></select>
      <button type="button" class="mini" data-alert-add>Add</button>
    </div>
    ${custom.length ? `<div class="chips" style="margin-top:8px">${custom.map(m => `<span class="chip on">${esc(alertLabel(m))} <button type="button" data-alert-del="${m}" aria-label="Remove ${esc(alertLabel(m))}">×</button></span>`).join('')}</div>` : ''}
    <p class="small" style="margin-top:8px">${on.length ? on.map(alertLabel).map(esc).join(' · ') : 'No reminders for this quest.'}</p>
  </div>`;
}
// wire the alert picker inside root; onChange(list) runs after every change (the list is saved by the caller)
export function bindAlerts(root, onChange) {
  root.addEventListener('click', e => {
    const box = root.querySelector('[data-alerts]'); if (!box) return;
    let list = readAlerts(root), changed = false;
    const preset = e.target.closest('[data-alert]'), del = e.target.closest('[data-alert-del]'), add = e.target.closest('[data-alert-add]');
    if (preset) { const m = +preset.dataset.alert; list = list.includes(m) ? list.filter(x => x !== m) : [...list, m]; changed = true; }
    else if (del) { const m = +del.dataset.alertDel; list = list.filter(x => x !== m); changed = true; }
    else if (add) {
      const n = Math.floor(+root.querySelector('[data-alert-n]').value), unit = +root.querySelector('[data-alert-u]').value;
      if (!(n >= 1)) { toast('Enter a number, like 2'); return; }
      if (n * unit > MAX_ALERT) { toast('A reminder can be up to a week before'); return; }
      list = [...list, n * unit]; changed = true;
    }
    if (!changed) return;
    list = cleanAlerts(list);
    box.outerHTML = alertPicker(list);
    onChange(list);
  });
}
export const readAlerts = root => { try { return JSON.parse(root.querySelector('[data-alerts]')?.dataset.list || '[]'); } catch (e) { return []; } };

export function reminderPicker(q, sel = selected(q), alerts) {
  if (q.due) return alertPicker(alerts ?? alertsFor(q)) + (q.remind && !q.remind.dismissed && !q.done ? `<div class="small" style="margin-top:6px">Next: ${esc(fmtStamp(q.remind.at))}</div>` : '');
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

// A season rank as a soft pill: a dot in the rank colour, the name, and 8 bars that fill up to the rank.
export function rankChip(exp) {
  const r = rankOf(exp), n = RANKS.findIndex(([name]) => name === r) + 1, label = rankLabel(exp);
  const bars = RANKS.map((_, i) => `<i${i < n ? ' class="on"' : ''}></i>`).join('');
  return `<span class="rank rank-${r.toLowerCase()}" title="${label}${masterLevel(exp) ? '' : `, rank ${n} of ${RANKS.length}`}"><i class="rank-dot"></i>${label}<span class="rank-bars" aria-hidden="true">${bars}</span></span>`;
}
// a chip for a rank saved by name ('Gold', 'Master 3'), e.g. a past season's best
export function rankChipNamed(label) {
  const base = String(label).startsWith('Master') ? 'Master' : label, n = RANKS.findIndex(([name]) => name === base) + 1;
  if (!n) return '';
  const bars = RANKS.map((_, i) => `<i${i < n ? ' class="on"' : ''}></i>`).join('');
  return `<span class="rank rank-${base.toLowerCase()}"><i class="rank-dot"></i>${esc(label)}<span class="rank-bars" aria-hidden="true">${bars}</span></span>`;
}
