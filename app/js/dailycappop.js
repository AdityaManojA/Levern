// Daily EXP Cap Pop-up: notifies users once they hit 55 EXP in a day (Indian Standard Time).
// Encourages healthy pacing, prevents leaderboard quest spamming, and clearly informs that
// extra points are awarded at reduced XP until the next reset tomorrow at 12:00 AM IST.
import { getState, setSetting, subscribe } from './store.js';
import { summary, DAILY_EXP_CAP, REDUCED_EXP_RATE } from './stats.js';
import { todayStrIST, nextMidnightIST, formatTimeUntilResetIST } from './dates.js';
import { esc } from './ui.js';
import { sfx } from './sound.js';
import { mascot } from './mascot.js';
import { permission, show } from './notify.js';

let openModal = null;

// Pure gating function for testing and clean decision making
export function shouldShowDailyCapPopup({ todayRawExp = 0, seenDate = null, todayDate = todayStrIST() } = {}) {
  if (todayRawExp < DAILY_EXP_CAP) return false;
  if (seenDate && seenDate === todayDate) return false;
  return true;
}

// User-facing copy explaining the 55 EXP cap, reduced XP, and next 12:00 AM IST reset
export function getDailyCapPopupContent(now = new Date()) {
  const remStr = formatTimeUntilResetIST(now);
  return {
    badge: '55 EXP CAP',
    subtitle: 'Fair Play · Indian Standard Time',
    title: 'Daily EXP Cap Reached',
    body: `You've earned ${DAILY_EXP_CAP} EXP today! To keep the leaderboard fair and prevent quest spamming, any additional quests or focus sessions today will grant reduced XP.`,
    resetInfo: `Refreshes tomorrow at 12:00 AM IST (midnight)${remStr ? ` · in ${remStr}` : ''}.`,
    buttonLabel: 'Got it, keep going',
  };
}

export function showDailyCapPopup(now = new Date()) {
  if (typeof document === 'undefined') return;
  if (openModal) {
    try { openModal.remove(); } catch (_) {}
    openModal = null;
  }

  const content = getDailyCapPopupContent(now);
  const el = document.createElement('div');
  el.className = 'rankup daily-cap-pop';
  el.setAttribute('role', 'alertdialog');
  el.setAttribute('aria-label', content.title);

  el.innerHTML = `<div class="rankup-card">
    <div class="daily-cap-badge" aria-hidden="true">
      <span class="daily-cap-val">${DAILY_EXP_CAP}</span>
      <span class="daily-cap-lbl">EXP CAP</span>
    </div>
    <div class="rankup-k">${esc(content.subtitle)}</div>
    <h3>${esc(content.title)}</h3>
    <p class="small">${esc(content.body)}</p>
    <div class="daily-cap-reset" aria-hidden="true">
      <span class="daily-cap-clock">🔄</span>
      <span>${esc(content.resetInfo)}</span>
    </div>
    <button class="btn sm" data-rankup-close>${esc(content.buttonLabel)}</button>
  </div>`;

  document.body.append(el);
  openModal = el;

  const close = () => {
    el.classList.remove('show');
    setTimeout(() => {
      try { el.remove(); } catch (_) {}
      if (openModal === el) openModal = null;
    }, 300);
  };

  el.addEventListener('click', e => {
    if (e.target === el || e.target.closest('[data-rankup-close]')) close();
  });

  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(close, 10000);

  // Audio & mascot celebration of genuine effort
  try { sfx('coin'); } catch (_) {}
  try { mascot?.react('rest', 'Paced and steady!'); } catch (_) {}

  // System notification if app is in background
  try {
    if (document.visibilityState !== 'visible' && permission() === 'granted') {
      show('Daily EXP Cap Reached', {
        body: `You've reached ${DAILY_EXP_CAP} EXP today. Additional points are reduced XP. Refreshes tomorrow at 12:00 AM IST.`,
        tag: 'daily-cap',
      });
    }
  } catch (_) {}
}

export function checkDailyCapAndNotify(now = new Date()) {
  const st = getState();
  if (!st || !st.settings) return;
  const todayDate = todayStrIST(now);
  const sum = summary(st.history, st.sessions, st.settings.target, now, st.quests);

  let seenDate = st.settings.dailyCapSeen;
  if (!seenDate && typeof localStorage !== 'undefined') {
    try { seenDate = localStorage.getItem('levern-daily-cap-seen'); } catch (_) {}
  }

  if (!shouldShowDailyCapPopup({ todayRawExp: sum.todayRawExp, seenDate, todayDate })) {
    return;
  }

  // Mark seen today in settings and localStorage
  setSetting('dailyCapSeen', todayDate);
  if (typeof localStorage !== 'undefined') {
    try { localStorage.setItem('levern-daily-cap-seen', todayDate); } catch (_) {}
  }

  showDailyCapPopup(now);
}

export function startDailyCapListener() {
  setTimeout(checkDailyCapAndNotify, 1500);
  subscribe(() => setTimeout(checkDailyCapAndNotify, 0));
}
