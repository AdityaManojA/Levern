// A saved name that fails the swear filter (picked before the filter existed, or on an older version, or a
// Google name that came in at sign-in) has to be replaced before Levern can be used: a window that can't be
// closed asks for a new one. It covers the greeting name and the leaderboard name, and the new name goes up to
// the leaderboard straight away. Checked at start-up and after every change (a sync can bring a name in).
import { getState, setSetting, subscribe } from './store.js';
import { isClean, tidyName, MAX_BOARD_NAME } from './namefilter.js';
import { publishSoon } from './board.js';

let el = null;
const badName = () => { const s = getState().settings; return (!!s.name && !isClean(s.name)) || (!!s.boardName && !isClean(s.boardName)); };

// Escape and Tab stay inside the window while it's up
function keys(e) {
  if (!el) return;
  if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); }
  if (e.key === 'Tab') {
    const f = [...el.querySelectorAll('input, button')], i = f.indexOf(document.activeElement);
    e.preventDefault(); f[(i + (e.shiftKey ? f.length - 1 : 1)) % f.length]?.focus();
  }
}

function show() {
  el = document.createElement('div');
  el.className = 'namefix';
  el.setAttribute('role', 'alertdialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-labelledby', 'namefix-t'); el.setAttribute('aria-describedby', 'namefix-d');
  el.innerHTML = `<form class="namefix-card" novalidate>
      <h2 id="namefix-t">Pick a new name</h2>
      <p id="namefix-d" class="small">Your name has a word that isn't allowed in Levern. Swear words and slurs can't be used in names, including on the leaderboard. Choose a new name to keep going.</p>
      <input class="field" name="n" maxlength="${MAX_BOARD_NAME}" autocomplete="off" autocapitalize="words" enterkeyhint="done" aria-label="New name" placeholder="Your new name">
      <div class="namefix-err small" aria-live="polite"></div>
      <button class="btn block" type="submit">Save name</button>
    </form>`;
  const form = el.querySelector('form'), input = form.n, err = el.querySelector('.namefix-err');
  form.addEventListener('submit', e => {
    e.preventDefault();
    const v = tidyName(input.value);
    const problem = v.replace(/[^\p{L}]/gu, '').length < 2 ? 'Use at least 2 letters.' : !isClean(v) ? "That name isn't allowed either. Try another." : '';
    if (problem) { err.textContent = problem; input.setAttribute('aria-invalid', 'true'); input.focus(); return; }
    const s = getState().settings;
    if (s.name && !isClean(s.name)) setSetting('name', v);
    if (s.boardName && !isClean(s.boardName)) setSetting('boardName', v);
    publishSoon();
    close();
  });
  input.addEventListener('input', () => { err.textContent = ''; input.removeAttribute('aria-invalid'); });
  document.addEventListener('keydown', keys, true);
  document.body.append(el);
  document.body.classList.add('namefix-on');
  for (const n of document.body.children) if (n !== el) n.inert = true;
  setTimeout(() => input.focus(), 50);
}

function close() {
  document.removeEventListener('keydown', keys, true);
  for (const n of document.body.children) n.inert = false;
  document.body.classList.remove('namefix-on');
  el?.remove(); el = null;
}

// wait(): true while something else must finish first (the welcome screens)
export function startNameCheck(wait = () => false) {
  const check = () => { if (!el && !wait() && badName()) show(); };
  check();
  subscribe(() => setTimeout(check, 0));
  setInterval(check, 5000);   // the welcome screens closing doesn't always save anything
}
