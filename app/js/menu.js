// A themed right-click / long-press menu for quest rows (Open, Done, Reminder, Delete).
// Everywhere else the browser's own menu stays, since text fields need copy and paste.
// The menu presses the row's own buttons, so it does exactly what tapping them does.
import { findQuest, deleteQuest, restoreQuest } from './store.js';
import { confirmBox, toast, play } from './ui.js';
import { reduced, EASE } from './motion.js';

let menu = null, back = null;

function close(refocus = true) {
  if (!menu) return;
  const m = menu, b = back; menu = back = null;
  try { m.hidePopover?.(); } catch (e) {}
  m.remove();
  if (refocus && b?.isConnected) b.focus({ preventScroll: true });
}

function open(row, x, y) {
  close(false);
  const id = row.querySelector('[data-act="toggle"]')?.dataset.id, q = id && findQuest(id);
  if (!q) return;
  const items = [
    ['open', 'Open quest'],
    ['toggle', q.done ? 'Mark not done' : 'Mark done'],
    ['remind', q.remind && !q.remind.dismissed && !q.done ? 'Change reminder' : 'Set a reminder'],
    ['delete', 'Delete', 'danger'],
  ];
  menu = document.createElement('div');
  menu.className = 'cmenu';
  menu.setAttribute('role', 'menu');
  menu.setAttribute('aria-label', q.title);
  menu.innerHTML = items.map(([k, l, c]) => `<button type="button" role="menuitem" tabindex="-1" data-m="${k}"${c ? ` class="${c}"` : ''}>${l}</button>`).join('');
  back = document.activeElement;
  if ('showPopover' in menu) { menu.popover = 'manual'; document.body.append(menu); menu.showPopover(); } else document.body.append(menu);
  const w = menu.offsetWidth, h = menu.offsetHeight, vw = document.documentElement.clientWidth;
  menu.style.left = `${Math.round(Math.min(Math.max(8, x), vw - w - 8))}px`;
  menu.style.top = `${Math.round(y + h > innerHeight - 8 ? Math.max(8, y - h) : y)}px`;
  if (!reduced()) menu.animate([{ opacity: 0, transform: 'scale(.96)' }, { opacity: 1, transform: 'none' }], { duration: 200, easing: EASE });
  const btns = [...menu.querySelectorAll('[role=menuitem]')];
  btns[0].focus({ preventScroll: true });

  menu.addEventListener('keydown', e => {
    const i = btns.indexOf(document.activeElement);
    const to = { ArrowDown: i + 1, ArrowUp: i - 1, Home: 0, End: btns.length - 1 }[e.key];
    if (to !== undefined) { e.preventDefault(); btns[(to + btns.length) % btns.length].focus(); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
    else if (e.key === 'Tab') { e.preventDefault(); close(); }
  });
  menu.addEventListener('click', async e => {
    const b = e.target.closest('[data-m]'); if (!b) return;
    const k = b.dataset.m;
    close(false);
    const press = sel => row.querySelector(sel)?.click();
    if (k === 'open') location.hash = '#/quest/' + q.id;
    if (k === 'toggle') press('[data-act="toggle"]');
    if (k === 'remind') press('[data-act="remind-edit"]');
    if (k === 'delete') {
      const title = q.title;
      if (await confirmBox(`Delete "${title}"?`)) {
        const copy = { ...q, subtasks: (q.subtasks || []).map(s => ({ ...s })) };
        deleteQuest(q.id);
        play('tap', 0.5);
        toast(`Deleted "${title}"`, '', {
          undo: () => {
            restoreQuest(copy);
            play('coin', 0.6);
            toast(`Restored "${title}"`, 'good');
          }
        });
      }
    }
  });
}

export function startMenu() {
  // on touch, a long press on a quest opens it to edit (main.js), so the menu is for right-click and the keyboard
  let lastPointer = 'mouse';
  document.addEventListener('pointerdown', e => { lastPointer = e.pointerType; }, true);
  document.addEventListener('contextmenu', e => {
    const row = e.target.closest('.q[data-key]');
    if (!row || e.target.closest('input, textarea, [contenteditable]')) return;
    e.preventDefault();
    if (lastPointer === 'touch' || lastPointer === 'pen') return;
    // the menu key / Shift+F10 come from the keyboard: anchor under the focused row instead of the pointer
    if (e.button !== 2 && !e.clientX && !e.clientY) { const r = row.getBoundingClientRect(); open(row, r.left + 16, r.bottom + 4); }
    else open(row, e.clientX, e.clientY);
  });
  document.addEventListener('pointerdown', e => { if (menu && !menu.contains(e.target)) close(false); }, true);
  addEventListener('scroll', () => close(false), true);
  addEventListener('resize', () => close(false));
  addEventListener('hashchange', () => close(false));
}
