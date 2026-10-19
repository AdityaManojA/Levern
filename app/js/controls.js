// Calm replacements for the browser's own controls: dropdowns, date, time and date-time pickers,
// and tooltips. The native element stays in the page, hidden, and keeps the value, so forms,
// `form.due.value` and the views' data-change handlers work unchanged: picking something here sets
// the native value and fires the same input and change events the browser would.
// Opt out per element with data-native. Popups use the Popover API (top layer, so sheets with
// transforms and overflow can't clip them) and fall back to a fixed element on <body>.
import { todayStr, addDays, addMonths, fromStr, monthGrid, fmtTime, fmtDate, parseTime } from './dates.js';
import { reduced, EASE } from './motion.js';

const POPOVER = typeof HTMLElement !== 'undefined' && 'showPopover' in HTMLElement.prototype;
const FULL_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAY_NAMES = [['Mo', 'Monday'], ['Tu', 'Tuesday'], ['We', 'Wednesday'], ['Th', 'Thursday'], ['Fr', 'Friday'], ['Sa', 'Saturday'], ['Su', 'Sunday']];
const CHEVRON = '<svg class="cv" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m7 10 5 5 5-5"/></svg>';
const ic = p => `<svg class="ci" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
const I_CAL = ic('<rect x="4" y="5" width="16" height="15" rx="3"/><path d="M4 10h16M9 3v4M15 3v4"/>');
const I_CLOCK = ic('<circle cx="12" cy="12" r="8"/><path d="M12 8v4l2.5 2"/>');
const ARROW = d => `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
const DATE_TYPES = ['date', 'time', 'datetime-local'];
let uid = 0;
const nid = p => `tf-${p}-${++uid}`;
const pad = n => String(n).padStart(2, '0');

/* ---------- native value plumbing ---------- */
const proto = el => el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
const nativeSet = (el, v) => Object.getOwnPropertyDescriptor(proto(el), 'value').set.call(el, v);
// code that sets el.value (the add sheet fills due/time from typed text) must repaint the trigger too
function watchValue(el, repaint) {
  for (const k of el instanceof HTMLSelectElement ? ['value', 'selectedIndex'] : ['value']) {
    const d = Object.getOwnPropertyDescriptor(proto(el), k);
    Object.defineProperty(el, k, { configurable: true, get() { return d.get.call(this); }, set(v) { d.set.call(this, v); repaint(); } });
  }
  el.form?.addEventListener('reset', () => setTimeout(repaint));
}
function commit(el, v) {
  if (el.value === v) return;
  nativeSet(el, v);
  el._tf?.repaint();
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}
// the native element: out of sight, out of the tab order, hidden from screen readers (the trigger speaks for it)
function hideNative(el, trigger) {
  el.classList.add('tf-native');
  el.tabIndex = -1;
  el.setAttribute('aria-hidden', 'true');
  el.addEventListener('focus', () => trigger.focus());   // <label for> clicks and form.x.focus() land on the trigger
  for (const l of el.labels || []) { if (!l.id) l.id = nid('lbl'); trigger.setAttribute('aria-labelledby', [l.id, trigger.id].join(' ')); }
  el.after(trigger);
}
const labelOf = el => el.getAttribute('aria-label') || [...(el.labels || [])].map(l => l.textContent.trim()).join(' ') || el.name || '';

/* ---------- one popup at a time ---------- */
let cur = null;   // { pop, trigger, onKey }
function openPop(trigger, pop) {
  closePop();
  pop.classList.add('cpop');
  if (POPOVER) { pop.popover = 'manual'; trigger.after(pop); pop.showPopover(); }
  else { pop.classList.add('cpop-fixed'); document.body.append(pop); }
  trigger.setAttribute('aria-expanded', 'true');
  cur = { pop, trigger };
  place();
  if (!reduced()) pop.animate([{ opacity: 0, transform: `translateY(${pop.dataset.side === 'top' ? 6 : -6}px) scale(.98)` }, { opacity: 1, transform: 'none' }], { duration: 240, easing: EASE });
  return pop;
}
function closePop(refocus = false) {
  if (!cur) return;
  const { pop, trigger } = cur; cur = null;
  trigger.setAttribute('aria-expanded', 'false');
  trigger.removeAttribute('aria-activedescendant');
  const gone = () => { try { if (POPOVER) pop.hidePopover(); } catch (e) {} pop.remove(); };
  if (reduced()) gone();
  else pop.animate([{ opacity: 1 }, { opacity: 0, transform: 'translateY(-4px) scale(.98)' }], { duration: 140, easing: 'ease-in' }).finished.then(gone, gone);
  if (refocus && trigger.isConnected) trigger.focus({ preventScroll: true });
}
function place() {
  if (!cur) return;
  const { pop, trigger } = cur;
  if (!trigger.isConnected) return closePop();
  const r = trigger.getBoundingClientRect(), vw = document.documentElement.clientWidth, vh = innerHeight, gap = 6;
  pop.style.minWidth = pop.classList.contains('clist') ? `${Math.max(r.width, 160)}px` : '';
  const w = pop.offsetWidth, h = pop.offsetHeight;
  const below = r.bottom + gap + h <= vh - 8, above = r.top - gap - h >= 8;
  const top = below || !above ? Math.min(r.bottom + gap, Math.max(8, vh - h - 8)) : r.top - gap - h;
  pop.dataset.side = below || !above ? 'bottom' : 'top';
  pop.style.left = `${Math.round(Math.min(Math.max(8, r.left), Math.max(8, vw - w - 8)))}px`;
  pop.style.top = `${Math.round(top)}px`;
}
if (typeof document !== 'undefined') {
  document.addEventListener('pointerdown', e => {
    if (cur && !cur.pop.contains(e.target) && !cur.trigger.contains(e.target)) closePop();
  }, true);
  addEventListener('resize', place);
  // the page or a sheet scrolled under an open popup: follow the trigger (scrolls inside the popup are its own)
  addEventListener('scroll', e => { if (cur && !cur.pop.contains(e.target)) place(); }, true);
  // Escape here must not also close the sheet behind (main.js listens on document)
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && cur && (cur.pop.contains(e.target) || cur.trigger === e.target)) { e.stopPropagation(); e.preventDefault(); closePop(true); }
  }, true);
  document.addEventListener('focusin', e => {
    if (cur && !cur.pop.contains(e.target) && cur.trigger !== e.target) closePop();
  });
}

/* ---------- dropdown (select-only combobox, WAI-ARIA APG pattern) ---------- */
function enhanceSelect(sel) {
  const btn = document.createElement('button');
  btn.type = 'button'; btn.id = nid('sel');
  btn.className = `csel ${sel.className}`.trim();
  if (sel.style.cssText) btn.style.cssText = sel.style.cssText;
  btn.setAttribute('role', 'combobox');
  btn.setAttribute('aria-haspopup', 'listbox');
  btn.setAttribute('aria-expanded', 'false');
  if (sel.getAttribute('aria-label')) btn.setAttribute('aria-label', sel.getAttribute('aria-label'));
  btn.innerHTML = `<span class="cv-t"></span>${CHEVRON}`;
  hideNative(sel, btn);
  let list = null, active = -1, typed = '', typedT;

  const opts = () => [...sel.options];
  const repaint = () => {
    const o = sel.options[sel.selectedIndex];
    btn.querySelector('.cv-t').textContent = o ? o.textContent : '';
    btn.disabled = sel.disabled;
  };
  const setActive = i => {
    const items = list.querySelectorAll('[role=option]');
    if (!items.length) return;
    active = Math.max(0, Math.min(items.length - 1, i));
    items.forEach((x, j) => x.classList.toggle('act', j === active));
    btn.setAttribute('aria-activedescendant', items[active].id);
    items[active].scrollIntoView({ block: 'nearest' });
  };
  const choose = i => { const o = opts()[i]; if (o && !o.disabled) commit(sel, o.value); closePop(true); };
  const open = () => {
    if (sel.disabled) return;
    list = document.createElement('div');
    list.className = 'clist'; list.id = nid('list');
    list.setAttribute('role', 'listbox');
    list.setAttribute('aria-labelledby', btn.id);
    list.innerHTML = opts().map((o, i) => `<div role="option" id="${list.id}-${i}" data-i="${i}" aria-selected="${i === sel.selectedIndex}"${o.disabled ? ' aria-disabled="true"' : ''}><span></span><svg class="tick" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg></div>`).join('');
    list.querySelectorAll('[role=option] > span').forEach((s, i) => { s.textContent = opts()[i].textContent; });
    btn.setAttribute('aria-controls', list.id);
    list.addEventListener('pointerdown', e => e.preventDefault());   // keep focus on the button
    list.addEventListener('click', e => { const o = e.target.closest('[role=option]'); if (o && o.getAttribute('aria-disabled') !== 'true') choose(+o.dataset.i); });
    list.addEventListener('pointermove', e => { const o = e.target.closest('[role=option]'); if (o && +o.dataset.i !== active) setActive(+o.dataset.i); });
    openPop(btn, list);
    setActive(Math.max(0, sel.selectedIndex));
  };
  const isOpen = () => cur && cur.pop === list;
  btn.addEventListener('click', () => isOpen() ? closePop(true) : open());
  btn.addEventListener('keydown', e => {
    const k = e.key, n = sel.options.length;
    if (!isOpen()) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' ', 'Home', 'End'].includes(k)) {
        e.preventDefault(); open();
        if (k === 'Home') setActive(0); if (k === 'End') setActive(n - 1);
      } else if (k.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) { open(); seek(k); }
      return;
    }
    const step = { ArrowDown: 1, ArrowUp: -1, PageDown: 8, PageUp: -8 }[k];
    if (step) { e.preventDefault(); if (e.altKey && k === 'ArrowUp') return choose(active); setActive(active + step); }
    else if (k === 'Home') { e.preventDefault(); setActive(0); }
    else if (k === 'End') { e.preventDefault(); setActive(n - 1); }
    else if (k === 'Enter' || k === ' ') { e.preventDefault(); choose(active); }
    else if (k === 'Tab') { choose(active); }
    else if (k.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); seek(k); }
  });
  // type the first letters of an option to jump to it
  function seek(ch) {
    clearTimeout(typedT); typed += ch.toLowerCase(); typedT = setTimeout(() => { typed = ''; }, 600);
    const all = opts(), from = typed.length === 1 ? active + 1 : active;
    for (let j = 0; j < all.length; j++) {
      const i = (from + j) % all.length;
      if (all[i].textContent.trim().toLowerCase().startsWith(typed)) { setActive(i); return; }
    }
  }
  watchValue(sel, repaint);
  new MutationObserver(repaint).observe(sel, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'selected'] });
  sel._tf = { repaint };
  repaint();
}

/* ---------- calendar grid (shared by the date and date-time pickers) ---------- */
// state: { value: 'YYYY-MM-DD' | '', month: 'YYYY-MM-01' }; onPick(dateStr)
function calendar(state, onPick, quick = true) {
  const box = document.createElement('div');
  box.className = 'ccal';
  const title = nid('cal');
  let focusDay = state.value || todayStr();
  const draw = (focus = false) => {
    const m = fromStr(state.month), today = todayStr(), grid = monthGrid(m.getFullYear(), m.getMonth());
    const rows = [];
    for (let r = 0; r < 6; r++) rows.push(grid.slice(r * 7, r * 7 + 7));
    box.innerHTML = `<div class="ccal-h">
        <button type="button" class="ccal-nav" data-m="-1" aria-label="Previous month">${ARROW('M15 5l-7 7 7 7')}</button>
        <b id="${title}" aria-live="polite">${FULL_MONTHS[m.getMonth()]} ${m.getFullYear()}</b>
        <button type="button" class="ccal-nav" data-m="1" aria-label="Next month">${ARROW('M9 5l7 7-7 7')}</button></div>
      <table role="grid" aria-labelledby="${title}"><thead><tr>${DAY_NAMES.map(([s, l]) => `<th scope="col" abbr="${l}"><span aria-hidden="true">${s}</span></th>`).join('')}</tr></thead>
      <tbody>${rows.map(r => `<tr>${r.map(d => {
        const dt = fromStr(d), out = dt.getMonth() !== m.getMonth();
        return `<td role="gridcell" aria-selected="${d === state.value}"><button type="button" data-d="${d}" tabindex="${d === focusDay ? 0 : -1}" class="${[out && 'out', d === today && 'today', d === state.value && 'on'].filter(Boolean).join(' ')}"${d === today ? ' aria-current="date"' : ''} aria-label="${dt.getDate()} ${FULL_MONTHS[dt.getMonth()]} ${dt.getFullYear()}${d === today ? ', today' : ''}">${dt.getDate()}</button></td>`;
      }).join('')}</tr>`).join('')}</tbody></table>
      ${quick ? `<div class="ccal-q"><button type="button" data-q="0">Today</button><button type="button" data-q="1">Tomorrow</button><button type="button" data-q="7">Next week</button><button type="button" data-q="clear" class="ghost">Clear</button></div>` : ''}`;
    if (focus) box.querySelector(`[data-d="${focusDay}"]`)?.focus({ preventScroll: true });
  };
  const moveTo = (d, focus = true) => {
    focusDay = d;
    const m = d.slice(0, 7) + '-01';
    if (m !== state.month) { state.month = m; draw(focus); }
    else {
      box.querySelectorAll('[data-d]').forEach(b => { b.tabIndex = b.dataset.d === d ? 0 : -1; });
      if (focus) box.querySelector(`[data-d="${d}"]`)?.focus({ preventScroll: true });
    }
  };
  box.addEventListener('click', e => {
    const nav = e.target.closest('[data-m]'), day = e.target.closest('[data-d]'), q = e.target.closest('[data-q]');
    if (nav) { state.month = addMonths(state.month, +nav.dataset.m); focusDay = state.month; draw(); return; }
    if (day) return onPick(day.dataset.d);
    if (q) return onPick(q.dataset.q === 'clear' ? '' : addDays(todayStr(), +q.dataset.q));
  });
  box.addEventListener('keydown', e => {
    const b = e.target.closest('[data-d]'); if (!b) return;
    const d = b.dataset.d, wd = (fromStr(d).getDay() + 6) % 7;
    const to = { ArrowLeft: addDays(d, -1), ArrowRight: addDays(d, 1), ArrowUp: addDays(d, -7), ArrowDown: addDays(d, 7),
      Home: addDays(d, -wd), End: addDays(d, 6 - wd), PageUp: addMonths(d, e.shiftKey ? -12 : -1), PageDown: addMonths(d, e.shiftKey ? 12 : 1) }[e.key];
    if (to) { e.preventDefault(); moveTo(to); }
  });
  draw();
  box.focusDay = () => moveTo(focusDay);
  box.select = d => { state.value = focusDay = d; state.month = d.slice(0, 7) + '-01'; draw(); };
  return box;
}

/* ---------- time list (shared by the time and date-time pickers) ---------- */
function timeList(value, onPick, labelText) {
  const box = document.createElement('div');
  box.className = 'ctime';
  const listId = nid('times');
  const slots = Array.from({ length: 96 }, (_, i) => `${pad(Math.floor(i / 4))}:${pad(i % 4 * 15)}`);
  if (value && !slots.includes(value)) { slots.push(value); slots.sort(); }
  box.innerHTML = `<label class="ctime-in"><span class="tf-sr">Type a time</span><input type="text" inputmode="text" autocomplete="off" placeholder="Type, e.g. 9:30 pm" aria-describedby="${listId}-hint"></label>
    <span id="${listId}-hint" class="tf-sr">Or pick one from the list below with the arrow keys.</span>
    <div class="ctime-l" role="listbox" id="${listId}" tabindex="0" aria-label="${labelText}">${slots.map((t, i) => `<div role="option" id="${listId}-${i}" data-t="${t}" aria-selected="${t === value}">${fmtTime(t)}</div>`).join('')}</div>`;
  const input = box.querySelector('input'), lb = box.querySelector('[role=listbox]'), items = [...lb.children];
  let active = Math.max(0, value ? slots.indexOf(value) : slots.indexOf('09:00'));
  const setActive = (i, scroll = true) => {
    active = Math.max(0, Math.min(items.length - 1, i));
    items.forEach((x, j) => x.classList.toggle('act', j === active));
    lb.setAttribute('aria-activedescendant', items[active].id);
    if (scroll) items[active].scrollIntoView({ block: 'nearest' });
  };
  lb.addEventListener('click', e => { const o = e.target.closest('[data-t]'); if (o) onPick(o.dataset.t); });
  lb.addEventListener('keydown', e => {
    const step = { ArrowDown: 1, ArrowUp: -1, PageDown: 4, PageUp: -4 }[e.key];
    if (step) { e.preventDefault(); setActive(active + step); }
    else if (e.key === 'Home') { e.preventDefault(); setActive(0); }
    else if (e.key === 'End') { e.preventDefault(); setActive(items.length - 1); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(slots[active]); }
    else if (/^\d$/.test(e.key)) { input.focus(); }   // typing a digit goes to the text box
  });
  input.addEventListener('input', () => {
    const t = parseTime(input.value);
    input.setAttribute('aria-invalid', String(!!input.value && !t));
    if (t) { const i = slots.findIndex(s => s >= t); setActive(i < 0 ? items.length - 1 : i); }
  });
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); const t = parseTime(input.value); if (t) onPick(t); else input.setAttribute('aria-invalid', 'true'); }
    if (e.key === 'ArrowDown') { e.preventDefault(); lb.focus(); }
  });
  box.ready = () => { setActive(active, false); const it = items[active]; lb.scrollTop = it.offsetTop - lb.clientHeight / 2 + it.offsetHeight / 2; };
  box.focusList = () => lb.focus({ preventScroll: true });
  return box;
}

/* ---------- date / time / date-time inputs ---------- */
function shownValue(type, v) {
  if (!v) return '';
  if (type === 'date') return fmtDate(v);
  if (type === 'time') return fmtTime(v);
  const [d, t] = v.split('T');
  return `${fmtDate(d)}, ${fmtTime(t.slice(0, 5))}`;
}
function enhanceDate(inp) {
  const type = inp.type, label = labelOf(inp) || { date: 'Date', time: 'Time', 'datetime-local': 'Date and time' }[type];
  const empty = inp.dataset.empty || { date: 'No date', time: 'No time', 'datetime-local': 'Pick a date and time' }[type];
  const btn = document.createElement('button');
  btn.type = 'button'; btn.id = nid('dt');
  btn.className = `cdate ${inp.className}`.trim();
  if (inp.style.cssText) btn.style.cssText = inp.style.cssText;
  btn.setAttribute('aria-haspopup', 'dialog');
  btn.setAttribute('aria-expanded', 'false');
  btn.innerHTML = `${type === 'time' ? I_CLOCK : I_CAL}<span class="cv-t"></span>`;
  hideNative(inp, btn);
  btn.removeAttribute('aria-labelledby');   // the full name, label and value, goes in aria-label below

  const repaint = () => {
    const t = shownValue(type, inp.value);
    btn.querySelector('.cv-t').textContent = t || empty;
    btn.classList.toggle('is-empty', !t);
    btn.setAttribute('aria-label', `${label}: ${t || empty}`);
    btn.disabled = inp.disabled;
  };
  const open = () => {
    if (inp.disabled) return;
    const pop = document.createElement('div');
    pop.className = `cpicker cpicker-${type}`;
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-label', `Choose ${label.toLowerCase()}`);
    const v = inp.value, [dv, tv] = type === 'datetime-local' ? [v.slice(0, 10), v.slice(11, 16)] : type === 'date' ? [v, ''] : ['', v];
    let cal = null, times = null, pickedDay = dv;
    if (type !== 'time') {
      cal = calendar({ value: dv, month: (dv || todayStr()).slice(0, 7) + '-01' }, d => {
        if (type === 'date' || !d) { commit(inp, d); closePop(true); return; }
        // date and time: picking the day keeps the popup open for the time
        pickedDay = d;
        commit(inp, `${d}T${inp.value.slice(11, 16) || '09:00'}`);
        cal.select(d);
        times.focusList();
      }, type === 'date');
    }
    if (type !== 'date') {
      times = timeList(tv, t => {
        if (type === 'time') commit(inp, t);
        else commit(inp, `${pickedDay || todayStr()}T${t}`);
        closePop(true);
      }, type === 'time' ? label : 'Time');
    }
    if (cal) pop.append(cal);
    if (times) pop.append(times);
    if (type === 'time') pop.insertAdjacentHTML('beforeend', '<div class="ccal-q"><button type="button" data-clear class="ghost">Clear</button></div>');
    if (type === 'datetime-local') pop.insertAdjacentHTML('beforeend', '<div class="ccal-q"><button type="button" data-clear class="ghost">Clear</button><button type="button" data-done>Done</button></div>');
    pop.addEventListener('click', e => {
      if (e.target.closest('[data-clear]')) { commit(inp, ''); closePop(true); }
      if (e.target.closest('[data-done]')) closePop(true);
    });
    // a non-modal dialog: Tab past its last control closes it and moves on
    pop.addEventListener('focusout', e => { if (cur?.pop === pop && e.relatedTarget && !pop.contains(e.relatedTarget) && e.relatedTarget !== btn) closePop(); });
    openPop(btn, pop);
    times?.ready();
    if (cal) cal.focusDay(); else times.focusList();
  };
  btn.addEventListener('click', () => cur?.trigger === btn ? closePop(true) : open());
  btn.addEventListener('keydown', e => { if (e.key === 'ArrowDown' || (e.altKey && e.key === 'ArrowDown')) { e.preventDefault(); open(); } });
  watchValue(inp, repaint);
  new MutationObserver(repaint).observe(inp, { attributes: true, attributeFilter: ['disabled'] });
  inp._tf = { repaint };
  repaint();
}

/* ---------- sliders: the filled part of the track follows the value ---------- */
function paintRange(r) {
  const min = +r.min || 0, max = r.max === '' ? 100 : +r.max;
  r.style.setProperty('--fill', `${((+r.value - min) / (max - min || 1)) * 100}%`);
}

/* ---------- tooltips: title="..." becomes a themed bubble ---------- */
const FOCUSABLE = 'a[href], button, input, select, textarea, [tabindex]';
let tip = null, tipFor = null, tipT;
function adoptTitle(el) {
  const t = el.getAttribute('title'); if (!t) return;
  el.removeAttribute('title');   // no native tooltip on top of ours
  el.dataset.tip = t;
  // keep what the title gave assistive tech: a description on controls, readable text on plain elements
  if (el.matches(FOCUSABLE)) el.setAttribute('aria-description', t);
  else if (!el.querySelector(':scope > .tf-sr')) el.insertAdjacentHTML('beforeend', `<span class="tf-sr">${t.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))}</span>`);
}
function showTip(el) {
  clearTimeout(tipT);
  if (!tip) {
    tip = document.createElement('div');
    tip.className = 'ctip'; tip.id = 'tf-tip'; tip.setAttribute('role', 'tooltip');
    if (POPOVER) tip.popover = 'manual';
    document.body.append(tip);
  }
  tip.textContent = el.dataset.tip;
  tipFor = el;
  if (POPOVER) { try { tip.hidePopover(); } catch (e) {} tip.showPopover(); }   // re-show so it stacks above an open popup
  tip.classList.add('on');
  const r = el.getBoundingClientRect(), w = tip.offsetWidth, h = tip.offsetHeight, vw = document.documentElement.clientWidth;
  const up = r.top - h - 8 >= 4;
  tip.dataset.side = up ? 'top' : 'bottom';
  tip.style.left = `${Math.round(Math.min(Math.max(6, r.left + r.width / 2 - w / 2), vw - w - 6))}px`;
  tip.style.top = `${Math.round(up ? r.top - h - 8 : r.bottom + 8)}px`;
}
function hideTip() {
  clearTimeout(tipT); tipFor = null;
  if (!tip) return;
  tip.classList.remove('on');
  if (POPOVER) { try { tip.hidePopover(); } catch (e) {} }
}

/* ---------- wiring ---------- */
function enhance(root) {
  const scope = root.querySelectorAll ? root : document;
  const all = sel => [...(root.matches?.(sel) ? [root] : []), ...scope.querySelectorAll(sel)];
  for (const s of all('select:not([data-native]):not([multiple])')) if (!s._tf && !(s.size > 1)) enhanceSelect(s);
  for (const i of all(DATE_TYPES.map(t => `input[type="${t}"]:not([data-native])`).join(','))) if (!i._tf) enhanceDate(i);
  for (const r of all('input[type="range"]')) paintRange(r);
  for (const t of all('[title]:not(svg *):not(svg)')) adoptTitle(t);
}

export function startControls() {
  enhance(document.body);
  new MutationObserver(muts => {
    for (const m of muts) {
      if (m.type === 'attributes') { if (m.target.hasAttribute('title')) adoptTitle(m.target); continue; }
      for (const n of m.addedNodes) if (n.nodeType === 1 && !n.classList.contains('cpop') && !n.classList.contains('ctip')) enhance(n);
      if (tipFor && !tipFor.isConnected) hideTip();
    }
  }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['title'] });
  document.addEventListener('input', e => { if (e.target.type === 'range') paintRange(e.target); });

  document.addEventListener('pointerover', e => {
    if (e.pointerType === 'touch') return;
    const el = e.target.closest?.('[data-tip]');
    if (!el || el === tipFor) return;
    clearTimeout(tipT);
    tipT = setTimeout(() => showTip(el), tip?.classList.contains('on') ? 60 : 450);
  });
  document.addEventListener('pointerout', e => {
    const el = e.target.closest?.('[data-tip]');
    if (el && !el.contains(e.relatedTarget)) { clearTimeout(tipT); if (tipFor === el) hideTip(); }
  });
  document.addEventListener('focusin', e => { const el = e.target.closest?.('[data-tip]'); if (el && el.matches(':focus-visible')) showTip(el); });
  document.addEventListener('focusout', () => hideTip());
  document.addEventListener('pointerdown', hideTip, true);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && tip?.classList.contains('on')) hideTip(); });
  addEventListener('scroll', hideTip, true);
}
