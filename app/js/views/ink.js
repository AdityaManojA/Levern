// Sketches and handwriting on a quest: the draw / write sheet, the viewer, and the pen toolbar the add sheet shares.
import { findQuest, addSketch, updateSketch, removeSketch, updateQuest, addSubtask } from '../store.js';
import { INKS, SIZES, toSvg, isBlank, sketchBytes, MAX_SKETCH_BYTES } from '../ink.js';
import { createPad } from '../inkpad.js';
import { handwritingLanguage, recognize, HANDWRITING_HELP } from '../handwriting.js';
import { sheet, esc, toast, play, ICON, confirmBox } from '../ui.js';
import { mascot } from '../mascot.js';

const INK_NAMES = ['Ink', 'Blue', 'Green', 'Rust', 'Plum'];

export function inkToolbar() {
  return `<div class="inktools" role="toolbar" aria-label="Pen">
    ${INKS.map((c, i) => `<button type="button" class="ink-dot${i ? '' : ' on'}" data-ink="${c}" style="--c:${c}" aria-label="${INK_NAMES[i]} pen" aria-pressed="${!i}"></button>`).join('')}
    <span class="ink-gap"></span>
    ${SIZES.map((s, i) => `<button type="button" class="ink-size${i === 1 ? ' on' : ''}" data-size="${s}" aria-label="${['Fine', 'Medium', 'Thick'][i]} line" aria-pressed="${i === 1}"><i style="--s:${4 + i * 4}px"></i></button>`).join('')}
    <span class="ink-gap"></span>
    <button type="button" class="ink-btn" data-tool="eraser" aria-label="Eraser" aria-pressed="false">${ICON.eraser}</button>
    <button type="button" class="ink-btn" data-ink-undo aria-label="Undo" disabled>${ICON.undo}</button>
    <button type="button" class="ink-btn ink-clear" data-ink-clear aria-label="Clear" disabled>${ICON.x}</button>
  </div>`;
}
// keeps the toolbar and the pad in step; returns a refresh() to call when the pad changes
export function wireToolbar(bar, pad) {
  const press = (sel, on) => bar.querySelectorAll(sel).forEach(b => { b.classList.toggle('on', on(b)); b.setAttribute('aria-pressed', on(b)); });
  function refresh() {
    press('[data-ink]', b => pad.tool === 'pen' && b.dataset.ink === pad.color);
    press('[data-size]', b => +b.dataset.size === pad.size);
    press('[data-tool]', () => pad.tool === 'eraser');
    bar.querySelector('[data-ink-undo]').disabled = !pad.canUndo();
    bar.querySelector('[data-ink-clear]').disabled = pad.isEmpty();
  }
  bar.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.ink) pad.setColor(b.dataset.ink);
    else if (b.dataset.size) { pad.setSize(+b.dataset.size); if (pad.tool === 'eraser') pad.setTool('pen'); }
    else if (b.dataset.tool) pad.setTool(pad.tool === 'eraser' ? 'pen' : 'eraser');
    else if ('inkUndo' in b.dataset) pad.undo();
    else if ('inkClear' in b.dataset) pad.clear();
    play('click', 0.4); refresh();
  });
  refresh();
  return refresh;
}

// live handwriting reading: call poke() after each stroke; reads once the pen rests for a moment
export function reader(pad, onRead) {
  let t = null, n = 0;
  return {
    poke() {
      clearTimeout(t);
      t = setTimeout(async () => {
        const id = ++n;
        if (pad.isEmpty()) return onRead([]);
        try { const r = await recognize(pad.rawStrokes(), pad.inputType()); if (id === n) onRead(r); }
        catch (e) { if (id === n) onRead(null); }
      }, 650);
    },
    stop() { clearTimeout(t); n++; },
  };
}

/* ---------- the draw / write sheet ---------- */
// openInk(questId, { kind: 'sketch' | 'writing', sketchId })
export async function openInk(questId, { kind = 'sketch', sketchId = null } = {}) {
  const q = findQuest(questId); if (!q) return;
  const existing = sketchId ? (q.sketches || []).find(k => k.id === sketchId) : null;
  if (existing) kind = existing.kind;
  const lang = await handwritingLanguage();
  const s = sheet.open(`<div class="inksheet" data-ink-sheet>
    <div class="sheet-h"><b>${existing ? 'Edit ' : ''}${kind === 'writing' ? 'Handwriting' : 'Sketch'}</b><button type="button" class="mini" data-close>Close</button></div>
    ${existing ? '' : `<div class="seg ink-seg" role="tablist"><button type="button" role="tab" data-kind="sketch" class="${kind === 'sketch' ? 'on' : ''}">${ICON.pen} Draw</button><button type="button" role="tab" data-kind="writing" class="${kind === 'writing' ? 'on' : ''}">Aa Write</button></div>`}
    <div class="small ink-hint" data-hint></div>
    <div data-pad></div>
    ${inkToolbar()}
    <div class="ink-read" data-read hidden>
      <label class="lbl" for="ink-text">Reads as</label>
      <input class="field" id="ink-text" data-text placeholder="Write above and it shows here" autocomplete="off">
      <div class="row-btns" style="margin-top:10px">
        <button type="button" class="btn white sm" data-to="notes" disabled>Add to notes</button>
        <button type="button" class="btn white sm" data-to="subtask" disabled>Add as subtask</button>
      </div>
    </div>
    <div style="height:14px"></div>
    <button type="button" class="btn block" data-save disabled>Save to quest</button>
  </div>`, 'ink-open');
  const root = s.querySelector('[data-ink-sheet]'), $ = sel => root.querySelector(sel);
  let pad, refresh, rd;

  function build() {
    pad && pad.destroy(); rd && rd.stop();
    pad = createPad($('[data-pad]'), { kind, sketch: existing, onStroke: () => { refresh(); paintSave(); kind === 'writing' && lang && rd.poke(); }, onChange: () => { refresh(); paintSave(); } });
    const bar = root.querySelector('.inktools'), fresh = bar.cloneNode(true); bar.replaceWith(fresh);   // drop the old pad's listeners
    refresh = wireToolbar(fresh, pad);
    rd = reader(pad, texts => {
      if (texts === null) { $('[data-hint]').textContent = "Couldn't read that. Your ink is still here."; return; }
      $('[data-text]').value = texts[0] || ''; paintRead();
    });
    const writing = kind === 'writing';
    $('[data-read]').hidden = !(writing && lang);
    $('[data-hint]').textContent = writing ? (lang ? 'Write a word or a line. It turns into text as you go.' : HANDWRITING_HELP)
      : 'Draw with a pen, a finger or the mouse. With a pen, your hand can rest on the screen.';
    if (existing && existing.text) $('[data-text]').value = existing.text;
    paintSave(); paintRead();
  }
  const paintSave = () => { $('[data-save]').disabled = pad.isEmpty(); $('[data-save]').textContent = kind === 'writing' && lang ? 'Save the ink too' : existing ? 'Save changes' : 'Save to quest'; };
  const paintRead = () => root.querySelectorAll('[data-to]').forEach(b => { b.disabled = !$('[data-text]').value.trim(); });
  build();

  function close() { rd.stop(); pad.destroy(); sheet.close(); }
  root.addEventListener('input', e => { if (e.target.matches('[data-text]')) paintRead(); });
  root.addEventListener('click', e => {
    if (e.target.closest('[data-close]')) { close(); return; }
    const k = e.target.closest('[data-kind]');
    if (k && k.dataset.kind !== kind) {
      if (!pad.isEmpty()) { toast('Clear the page first to switch'); return; }
      kind = k.dataset.kind; root.querySelectorAll('[data-kind]').forEach(b => b.classList.toggle('on', b.dataset.kind === kind));
      root.querySelector('.sheet-h b').textContent = kind === 'writing' ? 'Handwriting' : 'Sketch';
      play('click', 0.4); build(); return;
    }
    const to = e.target.closest('[data-to]');
    if (to) {
      const text = $('[data-text]').value.trim(); if (!text) return;
      const cur = findQuest(questId);
      if (to.dataset.to === 'notes') { updateQuest(questId, { notes: cur.notes ? `${cur.notes.replace(/\s+$/, '')}\n${text}` : text }); toast('Added to notes', 'good'); }
      else { addSubtask(questId, text); toast('Subtask added', 'good'); }
      play('click'); close(); return;
    }
    if (e.target.closest('[data-save]')) save();
  });

  function save() {
    const sk = { kind, ...pad.sketch() };
    const text = kind === 'writing' ? ($('[data-text]').value.trim() || undefined) : undefined;
    if (text) sk.text = text;
    if (isBlank(sk)) return;
    if (sketchBytes(sk) > MAX_SKETCH_BYTES) { toast('That page is too detailed to save. Try clearing a few strokes.'); mascot.grumpy('too much ink!'); return; }
    if (existing) updateSketch(questId, existing.id, { strokes: sk.strokes, w: sk.w, h: sk.h, text: sk.text });
    else addSketch(questId, sk);
    play('click'); close();
    toast(kind === 'writing' ? 'Handwriting saved' : 'Sketch saved', 'good');
    setTimeout(() => mascot.react('notify', 'nice drawing!'), 600);
  }
}

/* ---------- viewing one ---------- */
export function openSketch(questId, kid) {
  const q = findQuest(questId), k = q && (q.sketches || []).find(x => x.id === kid); if (!k) return;
  const s = sheet.open(`<div data-ink-view>
    <div class="sheet-h"><b>${k.kind === 'writing' ? 'Handwriting' : 'Sketch'}</b><button type="button" class="mini" data-close>Close</button></div>
    <div class="ink-big">${toSvg(k, { title: k.text || q.title })}</div>
    ${k.text ? `<p class="ink-said">"${esc(k.text)}"</p>` : ''}
    <div class="row-btns" style="margin-top:14px">
      <button type="button" class="btn white sm" data-edit>${ICON.pen} Edit</button>
      <button type="button" class="btn ghost sm" data-del>${ICON.trash} Delete</button>
    </div>
  </div>`);
  const root = s.querySelector('[data-ink-view]');
  root.addEventListener('click', async e => {
    if (e.target.closest('[data-close]')) return sheet.close();
    if (e.target.closest('[data-edit]')) return openInk(questId, { sketchId: kid });
    if (e.target.closest('[data-del]')) {
      sheet.close();
      if (!(await confirmBox(`Delete this ${k.kind === 'writing' ? 'handwriting' : 'sketch'}?`))) return;
      removeSketch(questId, kid); toast(k.kind === 'writing' ? 'Handwriting deleted' : 'Sketch deleted');
    }
  });
}

// the thumbnails on the quest screen
export function sketchThumbs(q) {
  const list = q.sketches || [];
  return `<div class="ink-thumbs">${list.map(k => `<button type="button" class="ink-thumb" data-act="sketch-view" data-kid="${esc(k.id)}" aria-label="Open ${k.kind === 'writing' ? 'handwriting' : 'sketch'}${k.text ? ': ' + esc(k.text) : ''}">${toSvg(k)}${k.text ? `<span>${esc(k.text)}</span>` : ''}</button>`).join('')}
    <button type="button" class="ink-thumb ink-add" data-act="ink-new" data-kind="sketch">${ICON.pen}<span>Draw</span></button>
    <button type="button" class="ink-thumb ink-add" data-act="ink-new" data-kind="writing"><b>Aa</b><span>Write</span></button>
  </div>`;
}
