// Light, dark or monochrome. The Theme setting is 'light', 'dark', 'mono' (or 'mono-light'), 'mono-dark' or 'auto' (follow the device); it's applied as
// <html data-theme>, which app.css uses to swap its colour tokens. The choice is also kept on the device,
// so js/theme-boot.js can set it before the first paint (no flash of the light theme).
import { getState, onSave } from './store.js';

const KEY = 'taskflow-theme';
const media = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;

export function resolveTheme(theme, prefersDark = false) {
  const t = theme || 'light';
  if (t === 'mono-dark' || t === 'monochrome-dark') return 'mono-dark';
  if (t === 'mono' || t === 'mono-light' || t === 'monochrome-light') return 'mono';
  if (t === 'dark' || (t === 'auto' && prefersDark)) return 'dark';
  return 'light';
}

export function applyTheme() {
  const t = getState?.()?.settings?.theme || 'light';
  const want = resolveTheme(t, !!media?.matches);
  const root = document.documentElement;
  if (root.dataset.theme === want) return;
  // Every control has its own colour fade; on a theme change they would all fade at different speeds and the
  // screen would look half-switched. So the whole switch happens at once, in one frame, with those fades off.
  root.classList.add('theme-swap');
  root.dataset.theme = want;
  const themeColor = want === 'dark' ? '#0E1014' : want === 'mono-dark' ? '#121212' : want === 'mono' ? '#F5F5F4' : '#FFF8EE';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', themeColor);
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
