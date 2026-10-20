// An iOS-style time picker: scrolling wheels for the hour, the minute and AM/PM. The value is a 24-hour
// "HH:MM" string kept in a hidden input, so the forms that read a time field keep working unchanged.
// While a wheel moves only the picker's own label changes. A "change" event (bubbling, as for a normal time
// field) is sent once, when the panel closes, so the form isn't redrawn under the finger.
import { esc } from './ui.js';

const ITEM = 44;           // height of one wheel row (px)
const ROWS = 5;            // rows visible in a wheel
const pad = n => String(n).padStart(2, '0');

const split = v => {
  if (!v) return null;
  const [h, m] = String(v).split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return { h12: (h % 12) || 12, m, pm: h >= 12 };
};
export const fmtTime = v => {
  const p = split(v); if (!p) return 'No time';
  return `${p.h12}:${pad(p.m)} ${p.pm ? 'PM' : 'AM'}`;
};

const column = (key, items, selected, label) => `
  <div class="tw-col" data-tw-col="${key}" role="listbox" aria-label="${label}">
    <div class="tw-list">${items.map((t, i) => `<div class="tw-item${i === selected ? ' on' : ''}" data-i="${i}" role="option" aria-selected="${i === selected}">${esc(t)}</div>`).join('')}</div>
  </div>`;

// HTML for one picker. `attrs` go on the hidden input (for example data-change="time" in a detail screen)
export function timeWheelHTML(value, { name = 'time', label = 'Time', attrs = '', disabled = false } = {}) {
  const p = split(value);
  const hours = Array.from({ length: 12 }, (_, i) => String(i + 1));
  const minutes = Array.from({ length: 60 }, (_, i) => pad(i));
  return `<div class="tw" data-tw aria-label="${esc(label)}">
    <input type="hidden" name="${esc(name)}" value="${esc(value || '')}" ${attrs} ${disabled ? 'disabled' : ''}>
    <button type="button" class="tw-btn" data-tw-open aria-expanded="false" ${disabled ? 'disabled' : ''}>${esc(fmtTime(value))}</button>
    <div class="tw-panel" hidden>
      ${column('h', hours, p ? p.h12 - 1 : 8, 'Hour')}
      ${column('m', minutes, p ? p.m : 0, 'Minute')}
      ${column('p', ['AM', 'PM'], p ? (p.pm ? 1 : 0) : 0, 'AM or PM')}
      <div class="tw-band" aria-hidden="true"></div>
      <div class="tw-foot"><button type="button" class="link" data-tw-clear>No time</button><button type="button" class="link" data-tw-done>Done</button></div>
    </div>
  </div>`;
}

// the value the three wheels currently show
function readWheel(tw) {
  const idx = key => {
    const col = tw.querySelector(`[data-tw-col="${key}"]`);
    return col ? Math.round(col.scrollTop / ITEM) : 0;
  };
  const h12 = idx('h') + 1, m = idx('m'), pm = idx('p') === 1;
  const h24 = (h12 % 12) + (pm ? 12 : 0);
  return `${pad(h24)}:${pad(m)}`;
}

function showWheel(tw, value) {
  const p = split(value);
  const want = { h: p ? p.h12 - 1 : 8, m: p ? p.m : 0, p: p ? (p.pm ? 1 : 0) : 0 };
  for (const key of ['h', 'm', 'p']) {
    const col = tw.querySelector(`[data-tw-col="${key}"]`);
    if (col) col.scrollTop = want[key] * ITEM;
    highlight(col);
  }
}

function highlight(col) {
  if (!col) return;
  const i = Math.round(col.scrollTop / ITEM);
  col.querySelectorAll('.tw-item').forEach((el, n) => { el.classList.toggle('on', n === i); el.setAttribute('aria-selected', n === i); });
}

// write a new value into a picker (from the form or the detail screen) and update its look
export function setTimeWheel(tw, value, disabled = false) {
  if (!tw) return;
  const input = tw.querySelector('input[type="hidden"]');
  input.value = value || '';
  tw.querySelector('.tw-btn').textContent = fmtTime(value);
  tw.querySelector('.tw-btn').disabled = !!disabled;
  input.disabled = !!disabled;
}

// show a value on the picker without telling the form yet (used while a wheel is moving)
function showValue(tw, value) {
  const input = tw.querySelector('input[type="hidden"]');
  input.value = value;
  tw.querySelector('.tw-btn').textContent = fmtTime(value);
}

// close a panel and announce the value if it changed since it opened
function closePanel(tw) {
  const panel = tw.querySelector('.tw-panel');
  if (panel.hidden) return;
  panel.hidden = true;
  tw.querySelector('[data-tw-open]').setAttribute('aria-expanded', 'false');
  const input = tw.querySelector('input[type="hidden"]');
  if (input.value !== tw.dataset.start) input.dispatchEvent(new Event('change', { bubbles: true }));
}

// one set of listeners for the whole app: opening, scrolling, tapping a row, Done, No time and taps outside
export function initTimeWheels() {
  const timers = new WeakMap();
  document.addEventListener('click', e => {
    const open = e.target.closest('[data-tw-open]');
    if (open) {
      const tw = open.closest('[data-tw]'); const panel = tw.querySelector('.tw-panel');
      const willOpen = panel.hidden;
      document.querySelectorAll('[data-tw]').forEach(other => { if (other !== tw) closePanel(other); });
      if (willOpen) {
        tw.dataset.start = tw.querySelector('input[type="hidden"]').value;
        panel.hidden = false; open.setAttribute('aria-expanded', 'true');
        showWheel(tw, tw.dataset.start);
      } else closePanel(tw);
      return;
    }
    const row = e.target.closest('.tw-item');
    if (row) {
      const col = row.closest('.tw-col');
      col.scrollTo({ top: +row.dataset.i * ITEM, behavior: 'smooth' });
      return;
    }
    const done = e.target.closest('[data-tw-done]');
    if (done) { closePanel(done.closest('[data-tw]')); return; }
    const clear = e.target.closest('[data-tw-clear]');
    if (clear) { const tw = clear.closest('[data-tw]'); showValue(tw, ''); closePanel(tw); return; }
    // a tap anywhere else closes an open picker
    document.querySelectorAll('[data-tw]').forEach(tw => { if (!tw.contains(e.target)) closePanel(tw); });
  });
  // a wheel shows its value once it has stopped moving; the form is told when the panel closes
  document.addEventListener('scroll', e => {
    const col = e.target.closest?.('.tw-col');
    if (!col) return;
    highlight(col);
    clearTimeout(timers.get(col));
    timers.set(col, setTimeout(() => {
      // snap to the nearest row, then show the value
      col.scrollTo({ top: Math.round(col.scrollTop / ITEM) * ITEM, behavior: 'smooth' });
      const tw = col.closest('[data-tw]');
      showValue(tw, readWheel(tw));
    }, 140));
  }, true);
}

// clear the value and announce it straight away
function commit(tw, value) {
  const input = tw.querySelector('input[type="hidden"]');
  if (input.value === value) return;
  setTimeWheel(tw, value, input.disabled);
  input.dispatchEvent(new Event('change', { bubbles: true }));
}
