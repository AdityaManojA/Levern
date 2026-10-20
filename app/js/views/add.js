// "New quest" sheet: type or speak; dates, times, repeats and priority are picked out of the words
// and can be changed before saving.
import { addQuest, tierLabel, TIER_COLORS, findQuest, getState } from '../store.js';
import { parseQuest } from '../parse.js';
import { fmtDate, fmtTime, fmtStamp } from '../dates.js';
import { REPEATS, dayChips } from '../recur.js';
import { timeWheelHTML, setTimeWheel } from '../timewheel.js';
import { sheet, esc, toast, play, ICON } from '../ui.js';
import { speechSupported, speechBroken, browserName, listen, speechError } from '../speech.js';
import { reminderPicker, bindPicker, readPicker, pickerKey } from './common.js';
import { requestPermission } from '../notify.js';
import { mascot } from '../mascot.js';
import { createPad } from '../inkpad.js';
import { isBlank, sketchBytes, MAX_SKETCH_BYTES } from '../ink.js';
import { handwritingLanguage, HANDWRITING_HELP } from '../handwriting.js';
import { inkToolbar, wireToolbar, reader } from './ink.js';
import { nextMultiAt } from '../multi.js';
// "Remind me several times a day": a checkbox, then every few hours in a window, or at set times
const multiBlock = m => `<label class="check-row"><input type="checkbox" name="multi" ${m ? 'checked' : ''}> Remind me several times a day</label>
  ${m ? `<div class="multi">
    <div class="seg"><button type="button" class="${m.times ? '' : 'on'}" data-mmode="every">Every few hours</button><button type="button" class="${m.times ? 'on' : ''}" data-mmode="times">At set times</button></div>
    ${m.times ? `<div class="mtimes">${m.times.map(t => `<span class="chip">${esc(t)} <button type="button" data-mdel="${esc(t)}" aria-label="Remove ${esc(t)}">×</button></span>`).join('')}
      <input class="field" type="time" name="mf" data-mf="time" aria-label="Add a time"></div>`
      : `<div class="mrow"><label>Every <input class="field" type="number" name="mf" data-mf="every" min="1" max="12" value="${m.every}"> hours</label>
        <label>from <input class="field" type="time" name="mf" data-mf="from" value="${m.from}"></label>
        <label>to <input class="field" type="time" name="mf" data-mf="to" value="${m.to}"></label></div>`}
  </div>` : ''}`;


export function openAdd(prefill = {}) {
  const f = { title: '', tier: 3, due: prefill.due || null, time: null, repeat: null, subtasks: [], remindKey: 'none' };
  const manual = new Set(prefill.due ? ['due'] : []);   // fields the user set by hand win over the parser
  let parsed = { chips: [] }, stop = null;
  const ink = { pad: null, rd: null, kind: 'writing', lang: null, refresh: null };

  const s = sheet.open(`<form data-addform autocomplete="off">
    <div class="sheet-h"><b>New quest</b><button type="button" class="mini" data-close>Close</button></div>
    <input class="field" name="title" placeholder="What do you need to do?" aria-label="Quest" enterkeyhint="done">
    <div data-tour="voice" class="tour-wrap"><button type="button" class="mic" data-mic ${speechSupported ? '' : 'disabled'} ${getState().settings.voice ? '' : 'hidden'}>
      <span class="orb">${ICON.mic}</span>
      <span><b data-mic-t>${speechSupported ? 'Tap and speak' : 'Voice not available here'}</b><small data-mic-s>${speechSupported ? 'Try "Dentist on Friday at 4pm"' : 'This browser has no speech recognition. Chrome, Edge and Safari do.'}</small></span>
    </button>
    <div class="sec" style="margin-top:10px">Picked up from your words</div>
    <div class="chips" data-chips></div></div>
    <button type="button" class="mic pen" data-pen aria-expanded="false">
      <span class="orb">${ICON.pen}</span>
      <span><b data-pen-t>Write or draw it</b><small data-pen-s>With a pen or your finger</small></span>
    </button>
    <div class="inkbox" data-inkbox hidden>
      <div class="seg ink-seg"><button type="button" data-kind="writing" class="on">Aa Write</button><button type="button" data-kind="sketch">${ICON.pen} Draw</button></div>
      <div class="small ink-hint" data-hint></div>
      <div data-pad></div>
      ${inkToolbar()}
      <label class="ink-keep"><input type="checkbox" data-keep> Keep the ink on the quest</label>
    </div>
    <label class="lbl">Priority</label>
    <div data-pick></div>
    <label class="lbl">Due</label>
    <div class="two"><input class="field" type="date" name="due" aria-label="Due date">${timeWheelHTML('', { name: 'time', label: 'Due time', disabled: true })}</div>
    <label class="lbl">Repeat</label>
    <select class="field" name="repeat">${REPEATS.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select>
    <div data-days></div>
    <div data-multi></div>
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
    setTimeWheel($f('[data-tw]'), f.time || '', !f.due);
    $f('[name=repeat]').value = f.repeat?.freq || '';
    $f('[data-days]').innerHTML = f.repeat?.freq === 'custom' ? dayChips(f.repeat.days) : '';
    $f('[data-multi]').innerHTML = f.repeat && f.due ? multiBlock(f.multi) : '';
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
    if (n === 'multi') { f.multi = e.target.checked ? { every: 2, from: '09:00', to: '21:00', times: null } : null; paint(); }
    if (n === 'mf' && f.multi) {
      const k = e.target.dataset.mf;
      if (k === 'every') f.multi.every = Math.min(12, Math.max(1, +e.target.value || 2));
      else if (k === 'time') { if (e.target.value) f.multi.times = [...new Set([...(f.multi.times || []), e.target.value])].sort(); }
      else if (e.target.value) f.multi[k] = e.target.value;
      paint();
    }
    if (n === 'repeat') {
      manual.add('repeat');
      if (e.target.value === 'custom') {
        // "on the days I choose" starts on the due day, so the person only has to add or remove days
        if (!f.due) f.due = todayLocal();
        f.repeat = { freq: 'custom', days: [new Date(f.due + 'T12:00:00').getDay()] };
      } else f.repeat = e.target.value ? { freq: e.target.value } : null;
      if (f.repeat && !f.due) { f.due = todayLocal(); manual.add('due'); }   // a repeat needs a date, so keep it when the title is typed
      paint(); paintPicker();
    }
  });
  form.addEventListener('click', e => {
    const mm = e.target.closest('[data-mmode]');
    if (mm && f.multi) { f.multi = { ...f.multi, times: mm.dataset.mmode === 'times' ? (f.multi.times || []) : null }; paint(); return; }
    const md = e.target.closest('[data-mdel]');
    if (md && f.multi?.times) { f.multi = { ...f.multi, times: f.multi.times.filter(t => t !== md.dataset.mdel) }; paint(); return; }
    const dd = e.target.closest('[data-day]');
    if (dd && f.repeat?.freq === 'custom') {
      const d = +dd.dataset.day, days = f.repeat.days || [];
      f.repeat = { freq: 'custom', days: days.includes(d) ? days.filter(x => x !== d) : [...days, d] };
      play('click', 0.4); paint();
      return;
    }
    if (e.target.closest('[data-close]')) { stop && stop(); dropInk(); sheet.close(); setTimeout(() => mascot.react('look-back', 'pfft'), 420); return; }
    const t = e.target.closest('[data-tier]');
    if (t) { manual.add('tier'); f.tier = +t.dataset.tier; play('click', 0.5); return paint(); }
    if (e.target.closest('[data-subadd]')) return addSub();
    const d = e.target.closest('[data-subdel]');
    if (d) { f.subtasks.splice(+d.dataset.subdel, 1); return paint(); }
    if (e.target.closest('[data-mic]')) return mic();
    if (e.target.closest('[data-pen]')) return togglePen();
    const k = e.target.closest('[data-inkbox] [data-kind]');
    if (k && k.dataset.kind !== ink.kind) {
      if (ink.pad && !ink.pad.isEmpty()) { toast('Clear the page first to switch'); return; }
      ink.kind = k.dataset.kind; $f('[data-inkbox]').querySelectorAll('[data-kind]').forEach(b => b.classList.toggle('on', b.dataset.kind === ink.kind));
      play('click', 0.4); buildPad();
    }
  });

  /* ---------- pen: handwriting fills in the quest, or a sketch goes with it ---------- */
  async function togglePen() {
    const box = $f('[data-inkbox]'), open = box.hidden;
    box.hidden = !open; $f('[data-pen]').setAttribute('aria-expanded', open);
    $f('[data-pen]').classList.toggle('on', open);
    if (open && !ink.pad) { ink.lang = await handwritingLanguage(); buildPad(); }
    play('click', 0.4);
  }
  function buildPad() {
    dropInk();
    const writing = ink.kind === 'writing', reads = writing && !!ink.lang;
    ink.pad = createPad($f('[data-pad]'), { kind: ink.kind, onStroke: () => { ink.refresh(); reads && ink.rd.poke(); }, onChange: () => ink.refresh() });
    const bar = $f('.inktools'), fresh = bar.cloneNode(true); bar.replaceWith(fresh);
    ink.refresh = wireToolbar(fresh, ink.pad);
    ink.rd = reader(ink.pad, texts => {
      if (!texts) return;
      const text = texts[0] || '';
      form.title.value = text; onText(text);
      $f('[data-pen-s]').textContent = text ? `Reads as "${text}"` : 'With a pen or your finger';
    });
    $f('[data-hint]').textContent = reads ? 'Write the quest, like "Dentist Friday 4pm". It fills in the name as you go.'
      : writing ? HANDWRITING_HELP : 'Draw a sketch to go with the quest. Give it a name above, or leave it and it is called "Sketch".';
    const keep = $f('[data-keep]');
    keep.checked = !reads; keep.disabled = !reads; keep.parentElement.hidden = !reads;
  }
  function dropInk() { ink.rd && ink.rd.stop(); ink.pad && ink.pad.destroy(); }
  // the ink to save with the quest, or null
  function inkToSave() {
    if (!ink.pad || $f('[data-inkbox]').hidden || ink.pad.isEmpty() || !$f('[data-keep]').checked) return null;
    const sk = { kind: ink.kind, ...ink.pad.sketch() };
    if (ink.kind === 'writing' && ink.lang && form.title.value.trim()) sk.text = form.title.value.trim();
    return isBlank(sk) ? null : sk;
  }
  form.sub.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addSub(); } });
  function addSub() { const v = form.sub.value.trim(); if (!v) return; f.subtasks.push(v); form.sub.value = ''; play('click', 0.5); paint(); }
  bindPicker($f('[data-picker]'), (spec, key) => { f.remindKey = key; if (spec) requestPermission(); });

  function markMicUnavailable() {
    const btn = $f('[data-mic]'); btn.disabled = true;
    $f('[data-mic-t]').textContent = 'Voice not available here';
    $f('[data-mic-s]').textContent = `${browserName()[0].toUpperCase() + browserName().slice(1)} can't do voice input. Chrome, Edge and Safari can. Type it above.`;
  }
  if (speechBroken()) markMicUnavailable();   // already found out earlier this session
  function mic() {
    const btn = $f('[data-mic]');
    if (stop) { stop(); return; }
    btn.classList.add('listening'); $f('[data-mic-t]').textContent = 'Listening…'; $f('[data-mic-s]').textContent = 'Speak now. Tap again to stop.';
    stop = listen({
      onText: (text, final) => { form.title.value = text; onText(text); if (final) $f('[data-mic-s]').textContent = `"${text}"`; },
      onStatus: text => { $f('[data-mic-s]').textContent = text + '. Speak now.'; },
      onError: code => {
        if (code === 'aborted') return;
        toast(speechError(code));
        if (code === 'unavailable') { markMicUnavailable(); form.title.focus(); }
      },
      onEnd: () => { stop = null; btn.classList.remove('listening'); if (!speechBroken()) $f('[data-mic-t]').textContent = form.title.value ? 'Got it. Tap to try again' : 'Tap and speak'; },
    });
  }

  form.addEventListener('submit', e => {
    e.preventDefault();
    stop && stop();
    const sk = inkToSave();
    if (sk && sketchBytes(sk) > MAX_SKETCH_BYTES) { toast('That page is too detailed to save. Try clearing a few strokes.'); return; }
    const raw = form.title.value.trim() || (sk ? (sk.kind === 'writing' ? 'Handwritten note' : 'Sketch') : '');
    if (!raw) { toast('Your quest needs a name'); mascot.grumpy('name it first!'); form.title.focus(); return; }
    if (f.due && f.repeat?.freq === 'custom' && !f.repeat.days?.length) { toast('Pick at least one day'); return; }
    const spec = readPicker($f('[data-picker]'), pickerKey($f('[data-picker]')));
    // several times a day: the reminder comes back on its own (multi.js)
    const mt = f.due && f.repeat && f.multi ? f.multi : null;
    if (mt?.times && !mt.times.length) { toast('Add at least one time'); return; }
    if (mt && !mt.times && !(mt.from < mt.to)) { toast('The end time has to be after the start'); return; }
    const mspec = mt ? (mt.times ? { times: [...mt.times] } : { every: mt.every, from: mt.from, to: mt.to }) : null;
    const remindSpec = mspec ? { multi: mspec, at: nextMultiAt(mspec) } : spec;
    const q = addQuest({ title: f.title || raw, tier: f.tier, due: f.due, time: f.due ? f.time : null, repeat: f.due ? f.repeat : null, subtasks: f.subtasks, remind: remindSpec || null, sketches: sk ? [sk] : [] });
    dropInk();
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
