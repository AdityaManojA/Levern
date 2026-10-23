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
  if (document.documentElement.dataset.theme === want) return;
  document.documentElement.dataset.theme = want;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#171411' : '#FFF8EE');
  try { localStorage.setItem(KEY, want); } catch (e) {}
}

export function startTheme() {
  applyTheme();
  onSave(applyTheme);
  media?.addEventListener?.('change', applyTheme);
}
