// "Sign in with Google" through Firebase Authentication. The Firebase SDK is loaded from Google's CDN
// only when it's needed (signing in, or a returning signed-in user), so the app still starts offline.
// The signed-in profile is remembered on the device, so it shows straight away on the next start.
// For now an account only says who you are; quests stay on this device.
import { FIREBASE } from '../config.js';

const SDK = 'https://www.gstatic.com/firebasejs/10.12.2/';
const KEY = 'taskflow-account';
let fb = null, loading = null;
const listeners = new Set();

const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch (e) { return null; } };
let current = read();
function save(u) {
  current = u ? { uid: u.uid, name: u.displayName || '', email: u.email || '', photo: u.photoURL || '' } : null;
  try { current ? localStorage.setItem(KEY, JSON.stringify(current)) : localStorage.removeItem(KEY); } catch (e) {}
  listeners.forEach(f => f(current));
}

async function load() {
  if (fb) return fb;
  if (!loading) loading = (async () => {
    const [{ initializeApp }, A] = await Promise.all([import(SDK + 'firebase-app.js'), import(SDK + 'firebase-auth.js')]);
    const auth = A.getAuth(initializeApp(FIREBASE));
    auth.useDeviceLanguage();
    A.onAuthStateChanged(auth, u => { if (u || current) save(u); });
    try { await A.getRedirectResult(auth); } catch (e) {}   // back from a redirect sign-in
    fb = { auth, A };
    return fb;
  })().catch(e => { loading = null; throw e; });
  return loading;
}

export const user = () => current;
// a fresh Firebase ID token for calling the TaskFlow server (null when signed out)
export async function idToken() {
  if (!current) return null;
  const f = await load();
  await f.auth.authStateReady();
  return f.auth.currentUser ? f.auth.currentUser.getIdToken() : null;
}
export const onAccount = fn => { listeners.add(fn); return () => listeners.delete(fn); };

export async function signIn() {
  if (!navigator.onLine) throw new Error("You're offline. Sign in once you're back online.");
  let f;
  try { f = await load(); } catch (e) { throw new Error("Couldn't reach Google. Check your connection and try again."); }
  const p = new f.A.GoogleAuthProvider();
  p.setCustomParameters({ prompt: 'select_account' });
  try { save((await f.A.signInWithPopup(f.auth, p)).user); return current; }
  catch (e) {
    if (e.code === 'auth/popup-closed-by-user' || e.code === 'auth/cancelled-popup-request') return null;
    // installed apps on some phones can't open popups: fall back to a full-page redirect
    if (e.code !== 'auth/popup-blocked' && e.code !== 'auth/operation-not-supported-in-this-environment') throw friendly(e);
  }
  try { await f.A.signInWithRedirect(f.auth, p); return null; } catch (e) { throw friendly(e); }
}
function friendly(e) {
  const m = {
    'auth/unauthorized-domain': 'Google sign-in isn\'t allowed on this address yet (Firebase console → Authentication → Settings → Authorised domains).',
    'auth/operation-not-allowed': 'Google sign-in isn\'t turned on yet (Firebase console → Authentication → Sign-in method → Google).',
    'auth/configuration-not-found': 'Google sign-in isn\'t turned on yet (Firebase console → Authentication → Get started, then Google).',
    'auth/network-request-failed': "Couldn't reach Google. Check your connection and try again.",
  }[e.code];
  return new Error(m || 'Sign-in didn\'t work. Please try again.');
}

export async function signOut() {
  try { const f = await load(); await f.A.signOut(f.auth); } catch (e) {}
  save(null);
}

// a returning signed-in user: refresh the session in the background once the app is up
export function startAccount() {
  if (current && navigator.onLine) setTimeout(() => load().catch(() => {}), 1500);
}
