// "Install app" support (Chrome, Edge, Android). Safari installs from Share → Add to Home Screen.
let evt = null, onChange = () => {};
export function watchInstall(cb) {
  onChange = cb;
  addEventListener('beforeinstallprompt', e => { e.preventDefault(); evt = e; onChange(); });
}
export const canInstall = () => !!evt;
export const isInstalled = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
export async function install() {
  if (!evt) return;
  evt.prompt();
  await evt.userChoice;
  evt = null; onChange();
}
