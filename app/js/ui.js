// Small UI helpers shared by the views.
import { getState } from './store.js';
import { sfx } from './sound.js';

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const ic = (p, w = 22) => `<svg width="${w}" height="${w}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
export const ICON = {
  home: ic('<path d="M4 11 12 4l8 7v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z"/>'),
  quests: ic('<rect x="4" y="4" width="16" height="16" rx="4"/><path d="m8 12 3 3 5-6"/>'),
  calendar: ic('<rect x="4" y="5" width="16" height="15" rx="3"/><path d="M4 10h16M9 3v4M15 3v4"/>'),
  focus: ic('<circle cx="12" cy="13" r="7"/><path d="M12 9v4l2.5 2M10 3h4"/>'),
  stats: ic('<path d="M5 20V11M12 20V5M19 20v-6"/>'),
  trophy: ic('<path d="M8 4h8v5a4 4 0 0 1-8 0V4z"/><path d="M8 6H5a2 2 0 0 0 0 4h1M16 6h3a2 2 0 0 1 0 4h-1"/><path d="M12 13v3M9 20h6M10 16h4"/>'),
  settings: ic('<path d="M5 7h8M17 7h2M5 17h2M11 17h8"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>'),
  bell: ic('<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>'),
  plus: ic('<path d="M12 5v14M5 12h14"/>', 26),
  mic: ic('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>', 24),
  repeat: ic('<path d="M17 2l3 3-3 3"/><path d="M4 11V9a4 4 0 0 1 4-4h12M7 22l-3-3 3-3"/><path d="M20 13v2a4 4 0 0 1-4 4H4"/>', 13),
  back: ic('<path d="M15 5l-7 7 7 7"/>'),
  left: ic('<path d="M15 5l-7 7 7 7"/>', 18),
  right: ic('<path d="M9 5l7 7-7 7"/>', 18),
  trash: ic('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>', 18),
  x: ic('<path d="M6 6l12 12M18 6 6 18"/>', 16),
  download: ic('<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>', 18),
  play: ic('<path d="M8 5v14l11-7z"/>', 20),
  pause: ic('<path d="M8 5v14M16 5v14"/>', 20),
  pen: ic('<path d="M15.5 4.5l4 4L9 19l-5 1 1-5z"/><path d="M13.5 6.5l4 4"/>', 18),
  eraser: ic('<path d="M8 20h12M5.5 14.5l8-8a2 2 0 0 1 2.8 0l2.2 2.2a2 2 0 0 1 0 2.8L12 18H8z"/><path d="M9.5 10.5l5 5"/>', 18),
  undo: ic('<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>', 18),
  sketch: ic('<path d="M4 17c3-6 5-9 7-9s0 8 3 8 3-5 6-6"/>', 13),
};

let toastT;
export function toast(msg, kind = '') {
  const t = $('#toast');
  t.className = 'toast ' + kind;
  t.textContent = msg;
  void t.offsetWidth; t.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2600);
}

// bottom sheet: open(html) returns the sheet element; close() hides it
export const sheet = {
  open(html, cls = '') {
    const s = $('#sheet');
    s.className = 'sheet ' + cls;
    s.innerHTML = `<div class="grab"></div>${html}`;
    void s.offsetWidth; s.classList.add('open'); $('#scrim').classList.add('on');
    s.scrollTop = 0;
    document.dispatchEvent(new CustomEvent('sheet:open'));
    return s;
  },
  close() { const was = this.isOpen(); $('#sheet').classList.remove('open'); $('#scrim').classList.remove('on'); if (was) document.dispatchEvent(new CustomEvent('sheet:close')); },
  isOpen: () => $('#sheet').classList.contains('open'),
};

export function confirmBox(msg, okLabel = 'Delete') {
  return new Promise(res => {
    const d = $('#dialog');
    d.innerHTML = `<form method="dialog"><p>${esc(msg)}</p><div class="row-btns"><button value="no" class="btn ghost">Cancel</button><button value="yes" class="btn danger">${esc(okLabel)}</button></div></form>`;
    d.onclose = () => res(d.returnValue === 'yes');
    d.showModal();
  });
}

export function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/* ---------- sounds ---------- */
// all sounds go through sound.js (Web Audio, preloaded); play() keeps the old call sites working
export function play(name, vol = 1, rate = 1) { sfx(name, { vol, rate }); }
