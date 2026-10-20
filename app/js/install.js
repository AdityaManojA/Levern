// "Install app" support (Chrome, Edge, Android). Safari installs from Share → Add to Home Screen.
let evt = null;
const listeners = new Set();
const tell = () => listeners.forEach(f => f());
// listen as soon as the app loads, so the browser's install offer is never missed
addEventListener('beforeinstallprompt', e => { e.preventDefault(); evt = e; tell(); });
export function watchInstall(cb) { listeners.add(cb); }
export const canInstall = () => !!evt;
export const isInstalled = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
export async function install() {
  if (!evt) return;
  evt.prompt();
  await evt.userChoice;
  evt = null; tell();
}
