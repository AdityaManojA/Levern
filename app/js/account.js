// "Sign in with Google" through Firebase Authentication, and the Firebase pieces that hang off it:
// the database (Firestore) for account sync, and Google Calendar access through the same Google sign-in.
// The Firebase SDK is loaded from Google's CDN only when it's needed (signing in, or a returning
// signed-in user), so the app still starts offline. The signed-in profile is remembered on the device,
// so it shows straight away on the next start.
import { FIREBASE } from '../config.js';
import { isClean } from './namefilter.js';

const SDK = 'https://www.gstatic.com/firebasejs/10.12.2/';
const KEY = 'taskflow-account';
let fb = null, loading = null, store = null;
const listeners = new Set();

const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch (e) { return null; } };
let current = read();
function save(u) {
  const next = u ? { uid: u.uid, name: u.displayName || '', email: u.email || '', photo: u.photoURL || '' } : null;
  const same = JSON.stringify(next) === JSON.stringify(current);
  current = next;
  try { current ? localStorage.setItem(KEY, JSON.stringify(current)) : localStorage.removeItem(KEY); } catch (e) {}
  if (!same) listeners.forEach(f => f(current));
}

async function load() {
  if (fb) return fb;
  if (!loading) loading = (async () => {
    slog('loading Google sign-in library');
    const [{ initializeApp }, A] = await Promise.all([import(SDK + 'firebase-app.js'), import(SDK + 'firebase-auth.js')]).catch(e => { serr('loading the library', e); throw e; });
    slog('library loaded');
    const app = initializeApp(FIREBASE);
    const auth = A.getAuth(app);
    auth.useDeviceLanguage();
    A.onAuthStateChanged(auth, u => { if (u || current) save(u); });
    try { const r = await A.getRedirectResult(auth); slog('redirect result', { signedIn: !!r }); } catch (e) { serr('redirect result', e); }   // back from a redirect sign-in
    fb = { app, auth, A };
    return fb;
  })().catch(e => { loading = null; throw e; });
  return loading;
}

export const user = () => current;

// The name to greet someone by, from a Google display name. Words that aren't a person's name
// ("Free Fire", "Test User", "Mr Smith") are skipped, so the greeting never reads "Good morning, Free".
const NOT_A_NAME = new Set(['free', 'test', 'tester', 'user', 'admin', 'guest', 'demo', 'the', 'mr', 'mrs', 'ms', 'miss', 'dr', 'sir', 'official',
  'real', 'its', 'im', 'iam', 'pro', 'gamer', 'gaming', 'channel', 'account', 'new', 'old', 'my', 'unknown', 'anonymous']);
export function greetName(full) {
  for (const raw of String(full || '').trim().split(/\s+/)) {
    const w = raw.replace(/[.'’]+$/, '');
    if (/^\p{L}[\p{L}'’-]*$/u.test(w) && w.length > 1 && !NOT_A_NAME.has(w.toLowerCase().replace(/['’]/g, '')) && isClean(w)) return w;
  }
  return '';
}
export const onAccount = fn => { listeners.add(fn); return () => listeners.delete(fn); };
// the signed-in Firebase user once the session is restored (null when signed out)
export async function firebaseUser() {
  if (!current) return null;
  const f = await load();
  await f.auth.authStateReady();
  return f.auth.currentUser;
}
export async function idToken() { const u = await firebaseUser(); return u ? u.getIdToken() : null; }
// Firestore, loaded on first use
export async function database() {
  if (store) return store;
  const f = await load();
  const F = await import(SDK + 'firebase-firestore.js');
  store = { db: F.getFirestore(f.app), F };
  return store;
}

// Load Firebase before the sign-in button is tapped: the popup must open straight from the tap,
// or phones block it and we'd fall back to a full-page redirect.
export const preload = () => load().catch(() => {});
import { slog, serr } from './signinlog.js';
const REDIRECT_KEY = 'taskflow-signin-redirect';
// kept in localStorage (not sessionStorage): the browser can hand the sign-in to another tab or window, which loses
// sessionStorage and would restart the welcome screens. Expires after 15 minutes.
const stashRedirect = () => { try { localStorage.setItem(REDIRECT_KEY, String(Date.now())); } catch (e) {} };
const unstashRedirect = () => { try { localStorage.removeItem(REDIRECT_KEY); } catch (e) {} };
// After a redirect sign-in the page reloads: true when that's what just happened (the caller then waits
// for finishRedirect() instead of starting the welcome screens from the top)
export const cameBackFromRedirect = () => { try { const t = +localStorage.getItem(REDIRECT_KEY); return !!t && Date.now() - t < 15 * 60000; } catch (e) { return false; } };
export async function finishRedirect() {
  unstashRedirect();
  try { const f = await load(); await f.auth.authStateReady(); if (f.auth.currentUser) save(f.auth.currentUser); } catch (e) {}
  return current;
}

export async function signIn() {
  slog('sign-in started', { online: navigator.onLine, cameBackFromRedirect: cameBackFromRedirect(), host: location.host });
  if (!navigator.onLine) { slog('offline: stopped'); throw new Error("You're offline. Sign in once you're back online."); }
  let f = fb;
  if (!f) { try { f = await load(); } catch (e) { serr('starting Google', e); throw new Error("Couldn't reach Google. Check your connection and try again."); } }
  const p = new f.A.GoogleAuthProvider();
  p.setCustomParameters({ prompt: 'select_account' });
  slog('opening Google popup');
  try { save((await f.A.signInWithPopup(f.auth, p)).user); slog('popup signed in'); return current; }
  catch (e) {
    serr('popup', e);
    if (e.code === 'auth/popup-closed-by-user' || e.code === 'auth/cancelled-popup-request') return null;
    // installed apps on some phones can't open popups: fall back to a full-page redirect
    if (e.code !== 'auth/popup-blocked' && e.code !== 'auth/operation-not-supported-in-this-environment') throw friendly(e);
  }
  stashRedirect();
  slog('going to Google (redirect)');
  try { await f.A.signInWithRedirect(f.auth, p); return null; } catch (e) { serr('redirect', e); unstashRedirect(); throw friendly(e); }
}

// Google Calendar access through the person's Google sign-in: asks Google for the extra permissions
// (a popup, so call it from a tap) and returns a short-lived access token (about an hour).
export async function googleAccess(scopes) {
  const u = await firebaseUser();
  if (!u) throw new Error('Sign in with Google first.');
  const f = await load();
  const p = new f.A.GoogleAuthProvider();
  scopes.forEach(s => p.addScope(s));
  if (current?.email) p.setCustomParameters({ login_hint: current.email });
  let r;
  try { r = await f.A.reauthenticateWithPopup(u, p); }
  catch (e) {
    if (e.code === 'auth/popup-closed-by-user' || e.code === 'auth/cancelled-popup-request') throw new Error('Google Calendar access was not given.');
    if (e.code === 'auth/user-mismatch') throw new Error('Pick the same Google account you signed in with.');
    if (e.code === 'auth/popup-blocked') throw new Error('Allow pop-ups for TaskFlow, then try again.');
    throw friendly(e);
  }
  const cred = f.A.GoogleAuthProvider.credentialFromResult(r);
  if (!cred?.accessToken) throw new Error('Google Calendar access was not given.');
  return { token: cred.accessToken, exp: Date.now() + 55 * 60000 };
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

// Delete the Google sign-in itself. Firebase only allows it soon after signing in, so it may ask the person to
// confirm with Google once more first. (Used by Delete account, only when no Solodesk workspace shares the sign-in.)
export async function deleteSignIn() {
  const u = await firebaseUser();
  if (!u) return;
  const f = await load();
  try { await f.A.deleteUser(u); }
  catch (e) {
    if (e.code !== 'auth/requires-recent-login') throw friendly(e);
    const p = new f.A.GoogleAuthProvider();
    if (current?.email) p.setCustomParameters({ login_hint: current.email });
    await f.A.reauthenticateWithPopup(u, p);
    await f.A.deleteUser(u);
  }
  save(null);
}

export async function signOut() {
  try { const f = await load(); await f.A.signOut(f.auth); } catch (e) {}
  save(null);
}

// a returning signed-in user: restore the session in the background once the app is up
export function startAccount() {
  if (current && navigator.onLine) setTimeout(() => load().catch(() => {}), 1500);
}
