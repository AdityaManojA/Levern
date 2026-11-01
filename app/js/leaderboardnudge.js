// A friendly prompt to check the leaderboard. Shown at most ONCE PER DAY, triggered
// when someone completes a task, and never on startup.
import { sheet, esc } from './ui.js';

const KEY = 'taskflow-lb-nudge';
const MAX_PER_DAY = 1;
const LINES = [
  'See who\'s on top today',
  'Check the leaderboard. Where do you stand?',
  'A new season starts every two weeks. Can you climb?',
  'Earn EXP today and move up the leaderboard',
  'Someone is ahead of you. Check the leaderboard',
  'Quick look: who\'s leading today?',
];

const read = () => {
  try {
    return (typeof localStorage !== 'undefined' ? JSON.parse(localStorage.getItem(KEY)) : null) || {};
  } catch (e) {
    return {};
  }
};

const write = v => {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, JSON.stringify(v));
  } catch (e) {}
};

// Pure check: determines if the leaderboard nudge should show right now
export function shouldShowLeaderboardNudge(now = Date.now()) {
  const today = new Date(now).toDateString();
  const s = read();
  if (s.day === today && s.count >= MAX_PER_DAY) return false;
  if (typeof location !== 'undefined' && location.hash && location.hash.startsWith('#/leaderboard')) return false;
  if (typeof document !== 'undefined') {
    if (document.body && document.body.classList && document.body.classList.contains('ob-lock')) return false;
    if (document.querySelector && (document.querySelector('.rankup') || document.querySelector('.dialog[open]'))) return false;
    if (sheet && typeof sheet.isOpen === 'function' && sheet.isOpen()) return false;
  }
  return true;
}

// Shows the prompt if it's due (at most once per day on task completion); returns true when shown
export function maybeLeaderboardNudge(now = Date.now()) {
  if (!shouldShowLeaderboardNudge(now)) return false;
  const today = new Date(now).toDateString();
  let s = read();
  if (s.day !== today) s = { day: today, count: 0, last: 0 };
  s.count = 1;
  s.day = today;
  s.last = now;
  write(s);

  if (typeof document !== 'undefined' && sheet && typeof sheet.open === 'function') {
    try {
      const line = LINES[(new Date(now).getDate() + s.count) % LINES.length];
      const el = sheet.open(`<div class="lbnudge">
        <p class="lbnudge-t">${esc(line)}</p>
        <div class="row-btns"><a class="btn dark sm" href="#/leaderboard" data-lb-go>See the leaderboard</a><button class="btn white sm" type="button" data-close>Not now</button></div>
      </div>`, 'small');
      if (el) {
        el.onclick = e => { if (e.target.closest('[data-close], [data-lb-go]')) sheet.close(); };
      }
    } catch (_) {}
  }

  return true;
}
