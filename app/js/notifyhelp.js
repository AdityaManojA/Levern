// Notification set-up for the device the person is on: Android or iPhone steps on a phone, install steps on a
// computer, and every set of steps when the device can't be told. Shown as a welcome step and in Settings.
import { permission, requestPermission } from './notify.js';
import { esc, toast } from './ui.js';

const ua = navigator.userAgent || '';
const iOS = () => /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
const android = () => /Android/.test(ua);
const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

// 'ios' | 'android' | 'desktop' | 'all' (when the device can't be told)
export function deviceKind() {
  if (!ua) return 'all';
  const narrow = matchMedia('(max-width: 640px)').matches;
  if (narrow || (navigator.maxTouchPoints > 0 && (iOS() || android()))) {
    if (iOS()) return 'ios';
    if (android()) return 'android';
    return 'all';
  }
  return 'desktop';
}

const SECTIONS = {
  ios: {
    title: 'On iPhone or iPad',
    steps: [
      'Open Levern in Safari. Tap the Share button (the square with an arrow).',
      'Tap "Add to Home Screen", then "Add".',
      'Open Levern from its Home Screen icon. On iPhone, notifications only work from there.',
      'Tap "Turn on notifications" below and choose Allow.',
    ],
    note: 'Needs iOS 16.4 or later.',
    fix: 'Turned off by mistake? Open Settings, then Notifications, then Levern, and turn on Allow Notifications.',
  },
  android: {
    title: 'On Android',
    steps: [
      'Open Levern in Chrome. Tap the ⋮ menu at the top right.',
      'Tap "Install app" or "Add to Home screen".',
      'Tap "Turn on notifications" below and choose Allow.',
    ],
    fix: 'Turned off by mistake? Tap the lock icon by the address, then Notifications, then Allow.',
  },
  desktop: {
    title: 'On a computer',
    steps: [
      'In Chrome or Edge, click the install icon at the right of the address bar (or open the menu and choose Install Levern). It opens in its own window.',
      'Tap "Turn on notifications" below and choose Allow.',
    ],
    fix: 'Turned off by mistake? Click the lock icon in the address bar, then Notifications, then Allow.',
  },
};

const section = (kind, withTitle) => {
  const s = SECTIONS[kind];
  return `<div class="notify-kind">
    ${withTitle ? `<b>${s.title}</b>` : ''}
    <ol>${s.steps.map(t => `<li>${esc(t)}</li>`).join('')}</ol>
    ${s.note ? `<p class="small">${esc(s.note)}</p>` : ''}
    <p class="small">${esc(s.fix)}</p>
  </div>`;
};

// the whole block: the steps for this device, and the button that asks for permission
export function notifyCard() {
  const p = permission(), kind = deviceKind();
  const kinds = kind === 'all' ? ['ios', 'android', 'desktop'] : [kind];
  const needsHomeScreen = iOS() && !standalone();
  const action = p === 'granted' ? '<span class="ob-pill done">Notifications are on</span>'
    : needsHomeScreen ? '<p class="small">On iPhone, add Levern to your Home Screen first, then open it from there and tap "Turn on notifications".</p>'
    : p === 'denied' ? '<p class="small">Notifications are blocked for Levern. Use the steps above to allow them again.</p>'
    : '<button type="button" class="btn block" data-notify-on>Turn on notifications</button>';
  return `<div class="notify-card" data-notify-card>
    <p class="small">Reminders for due quests arrive as notifications, even when Levern is closed.</p>
    ${kinds.map(k => section(k, kind === 'all')).join('')}
    <div class="notify-act">${action}</div>
  </div>`;
}

// one listener for every notification card in the app: asks for permission, then redraws the cards
document.addEventListener('click', async e => {
  if (!e.target.closest('[data-notify-on]')) return;
  if (!('Notification' in window)) { toast('Add Levern to your Home Screen first, then open it from there.'); return; }
  await requestPermission();
  document.querySelectorAll('[data-notify-card]').forEach(el => { el.outerHTML = notifyCard(); });
  if (permission() === 'granted') toast('Notifications are on', 'good');
});
