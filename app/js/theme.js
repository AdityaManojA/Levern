// Light or dark. The Theme setting is 'light', 'dark' or 'auto' (follow the device); it's applied as
// <html data-theme>, which app.css uses to swap its colour tokens. The choice is also kept on the device,
// so js/theme-boot.js can set it before the first paint (no flash of the light theme).
import { getState, onSave } from './store.js';

const KEY = 'taskflow-theme';
const media = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;

export function applyTheme() {
  const t = getState().settings.theme || 'light';
  const dark = t === 'dark' || (t === 'auto' && !!media?.matches);
  const want = dark ? 'dark' : 'light';
  const root = document.documentElement;
  if (root.dataset.theme === want) return;
  // Every control has its own colour fade; on a theme change they would all fade at different speeds and the
  // screen would look half-switched. So the whole switch happens at once, in one frame, with those fades off.
  root.classList.add('theme-swap');
  root.dataset.theme = want;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0E1014' : '#FFF8EE');
  void root.offsetHeight;   // the new colours apply now
  requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove('theme-swap')));
  setTimeout(() => root.classList.remove('theme-swap'), 200);   // in case frames are paused (hidden tab)
  try { localStorage.setItem(KEY, want); } catch (e) {}
}

export function startTheme() {
  applyTheme();
  onSave(applyTheme);
  media?.addEventListener?.('change', applyTheme);
}
