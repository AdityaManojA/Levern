// Light, dark or monochrome. The Theme setting is 'light', 'dark', 'mono', 'mono-light-accent',
// 'mono-dark', 'mono-dark-accent', or 'auto' (follow the device); it's applied as
// <html data-theme>, which app.css uses to swap its colour tokens. The choice is also kept on the device,
// so js/theme-boot.js can set it before the first paint (no flash of the light theme).
import { getState, onSave } from './store.js';

const KEY = 'taskflow-theme';
const SEASON_OFF_KEY = 'taskflow-halloween-off';
const media = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;

export function resolveTheme(theme, prefersDark = false) {
  const t = theme || 'light';
  if (t === 'mono-dark-accent' || t === 'monochrome-dark-accent') return 'mono-dark-accent';
  if (t === 'mono-light-accent' || t === 'monochrome-light-accent') return 'mono-light-accent';
  if (t === 'mono-dark' || t === 'monochrome-dark') return 'mono-dark';
  if (t === 'mono' || t === 'mono-light' || t === 'monochrome-light') return 'mono';
  if (t === 'dark' || (t === 'auto' && prefersDark)) return 'dark';
  return 'light';
}

// Halloween week (31 Oct to 6 Nov, local date): everyone's default theme, built on Dark Mode with its own colours
// (app.css [data-season="halloween"]). Picking another theme in Settings sets halloweenOff to the year, which turns
// it off for the rest of that week on every device; picking Halloween again clears it. The saved theme never changes.
export function isHalloweenWeek(d = new Date()) {
  const y = d.getFullYear();
  return d >= new Date(y, 9, 31) && d < new Date(y, 10, 7);
}
export function halloweenActive(settings, d = new Date()) {
  return isHalloweenWeek(d) && settings?.halloweenOff !== String(d.getFullYear());
}

export function applyTheme() {
  const s = getState?.()?.settings || {};
  const halloween = halloweenActive(s);
  const want = halloween ? 'dark' : resolveTheme(s.theme || 'light', !!media?.matches);
  const season = halloween ? 'halloween' : '';
  const root = document.documentElement;
  try { localStorage.setItem(SEASON_OFF_KEY, s.halloweenOff || ''); } catch (e) {}
  if (root.dataset.theme === want && (root.dataset.season || '') === season) return;
  // Every control has its own colour fade; on a theme change they would all fade at different speeds and the
  // screen would look half-switched. So the whole switch happens at once, in one frame, with those fades off.
  root.classList.add('theme-swap');
  root.dataset.theme = want;
  if (season) root.dataset.season = season; else delete root.dataset.season;
  const themeColor = season ? '#120D1A'
                   : want === 'dark' ? '#0E1014'
                   : (want === 'mono-dark' || want === 'mono-dark-accent') ? '#121212'
                   : (want === 'mono' || want === 'mono-light-accent') ? '#F5F5F4'
                   : '#FFF8EE';
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
