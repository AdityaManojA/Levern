// "New quest" sheet: type or speak; dates, times, repeats and priority are picked out of the words
// and can be changed before saving.
import { addQuest, tierLabel, TIER_COLORS, findQuest, getState } from '../store.js';
import { parseQuest } from '../parse.js';
import { fmtDate, fmtTime, fmtStamp } from '../dates.js';
import { REPEATS } from '../recur.js';
import { sheet, esc, toast, play, ICON } from '../ui.js';
import { speechSupported, listen, speechError } from '../speech.js';
import { reminderPicker, bindPicker, readPicker, pickerKey } from './common.js';
import { requestPermission } from '../notify.js';
import { mascot } from '../mascot.js';

export function openAdd(prefill = {}) {
  const f = { title: '', tier: 3, due: prefill.due || null, time: null, repeat: null, subtasks: [], remindKey: 'none' };
  const manual = new Set(prefill.due ? ['due'] : []);   // fields the user set by hand win over the parser
  let parsed = { chips: [] }, stop = null;

  const s = sheet.open(`<form data-addform autocomplete="off">
    <div class="sheet-h"><b>New quest</b><button type="button" class="mini" data-close>Close</button></div>
    <input class="field" name="title" placeholder="What do you need to do?" aria-label="Quest" enterkeyhint="done">
    <div data-tour="voice" class="tour-wrap"><button type="button" class="mic" data-mic ${speechSupported ? '' : 'disabled'} ${getState().settings.voice ? '' : 'hidden'}>
      <span class="orb">${ICON.mic}</span>
      <span><b data-mic-t>${speechSupported ? 'Tap and speak' : 'Voice not available here'}</b><small data-mic-s>${speechSupported ? 'Try "Dentist on Friday at 4pm"' : 'This browser has no speech recognition. Chrome, Edge and Safari do.'}</small></span>
    </button>
    <div class="sec" style="margin-top:10px">Picked up from your words</div>
    <div class="chips" data-chips></div></div>
    <label class="lbl">Priority</label>
    <div data-pick></div>
    <label class="lbl">Due</label>
    <div class="two"><input class="field" type="date" name="due" aria-label="Due date"><input class="field" type="time" name="time" aria-label="Due time"></div>
    <label class="lbl">Repeat</label>
    <select class="field" name="repeat">${REPEATS.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select>
    <label class="lbl">Reminder</label>
    <div data-picker></div>
    <label class="lbl">Subtasks</label>
    <div class="addsub" style="margin-top:0"><input class="field" name="sub" placeholder="Add a subtask" style="padding:8px 12px"><button type="button" class="mini" data-subadd>Add</button></div>
    <div class="chips" data-subs style="margin-top:8px"></div>
    <div style="height:16px"></div>
    <button class="btn block" type="submit">Save quest</button>
  </form>`);
  const form = s.querySelector('[data-addform]'), $f = sel => form.querySelector(sel);

  function paint() {
    $f('[data-chips]').innerHTML = parsed.chips.length
      ? parsed.chips.map(c => `<span class="chip" style="background:${c.kind === 'tier' || c.kind === 'keyword' ? TIER_COLORS[f.tier] : c.kind === 'repeat' ? 'var(--mint)' : 'var(--sky)'}">${esc(c.text)}</span>`).join('')
        + (f.due ? `<span class="chip">→ ${esc(fmtDate(f.due))}${f.time ? ' ' + esc(fmtTime(f.time)) : ''}</span>` : '')
      : '<span class="small">Nothing yet. Try "tomorrow at 6pm", "every Monday" or "exam".</span>';
    $f('[data-pick]').innerHTML = `<div class="pick">${TIER_COLORS.map((c, i) => `<button type="button" data-tier="${i}" class="${i === f.tier ? 'on' : ''}" style="--c:${c}">P${i + 1}</button>`).join('')}</div><div class="small" style="margin-top:6px">${esc(tierLabel(f.tier))}</div>`;
    $f('[name=due]').value = f.due || '';
    $f('[name=time]').value = f.time || '';
    $f('[name=time]').disabled = !f.due;
    $f('[name=repeat]').value = f.repeat?.freq || '';
    $f('[data-subs]').innerHTML = f.subtasks.map((t, i) => `<span class="chip">${esc(t)} <button type="button" data-subdel="${i}" aria-label="Remove" style="border:none;background:none;font-weight:700">×</button></span>`).join('');
  }
  function paintPicker() { $f('[data-picker]').innerHTML = reminderPicker({ due: f.due, time: f.time, remind: null }, f.remindKey); }
  function onText(text) {
    parsed = parseQuest(text);
    if (!manual.has('tier')) f.tier = parsed.tier;
    if (!manual.has('due')) { f.due = parsed.due; f.time = parsed.time; }
    if (!manual.has('repeat')) f.repeat = parsed.repeat;
    f.title = parsed.title;
    const hadDue = $f('[data-ropts] [data-r="r0"]') != null;
    paint();
    if (hadDue !== !!f.due) { if (!f.due && f.remindKey.startsWith('r')) f.remindKey = 'none'; paintPicker(); }
  }

  form.addEventListener('input', e => {
    if (e.target.name === 'title') onText(e.target.value);
  });
  form.addEventListener('change', e => {
    const n = e.target.name;
    if (n === 'due') { manual.add('due'); f.due = e.target.value || null; if (!f.due) { f.time = null; f.repeat = null; } paint(); paintPicker(); }
    if (n === 'time') { manual.add('due'); f.time = e.target.value || null; }
    if (n === 'repeat') { manual.add('repeat'); f.repeat = e.target.value ? { freq: e.target.value } : null; if (f.repeat && !f.due) { f.due = todayLocal(); } paint(); paintPicker(); }
  });
  form.addEventListener('click', e => {
    if (e.target.closest('[data-close]')) { stop && stop(); sheet.close(); setTimeout(() => mascot.react('look-back', 'pfft'), 420); return; }
    const t = e.target.closest('[data-tier]');
    if (t) { manual.add('tier'); f.tier = +t.dataset.tier; play('click', 0.5); return paint(); }
    if (e.target.closest('[data-subadd]')) return addSub();
    const d = e.target.closest('[data-subdel]');
    if (d) { f.subtasks.splice(+d.dataset.subdel, 1); return paint(); }
    if (e.target.closest('[data-mic]')) return mic();
  });
  form.sub.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addSub(); } });
  function addSub() { const v = form.sub.value.trim(); if (!v) return; f.subtasks.push(v); form.sub.value = ''; play('click', 0.5); paint(); }
  bindPicker($f('[data-picker]'), (spec, key) => { f.remindKey = key; if (spec) requestPermission(); });

  function mic() {
    const btn = $f('[data-mic]');
    if (stop) { stop(); return; }
    btn.classList.add('listening'); $f('[data-mic-t]').textContent = 'Listening…'; $f('[data-mic-s]').textContent = 'Speak now. Tap again to stop.';
    stop = listen({
      onText: (text, final) => { form.title.value = text; onText(text); if (final) $f('[data-mic-s]').textContent = `"${text}"`; },
      onError: code => { if (code !== 'aborted') toast(speechError(code)); },
      onEnd: () => { stop = null; btn.classList.remove('listening'); $f('[data-mic-t]').textContent = form.title.value ? 'Got it. Tap to try again' : 'Tap and speak'; },
    });
  }

  form.addEventListener('submit', e => {
    e.preventDefault();
    stop && stop();
    const raw = form.title.value.trim();
    if (!raw) { toast('Your quest needs a name'); mascot.grumpy('name it first!'); form.title.focus(); return; }
    const spec = readPicker($f('[data-picker]'), pickerKey($f('[data-picker]')));
    const q = addQuest({ title: f.title || raw, tier: f.tier, due: f.due, time: f.due ? f.time : null, repeat: f.due ? f.repeat : null, subtasks: f.subtasks, remind: spec || null });
    play('click');
    sheet.close();
    setTimeout(() => mascot.react('notify', 'new quest!'), 650);
    const nq = findQuest(q.id);
    toast(`Quest added to ${tierLabel(f.tier)}${nq.remind ? ` · reminder ${fmtStamp(nq.remind.at)}` : ''}`, 'good');
  });

  paint(); paintPicker();
  setTimeout(() => form.title.focus(), 280);
}
const todayLocal = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
