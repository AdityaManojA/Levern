// TaskFlow settings that differ per install. Not secret: a Google OAuth *client ID* is public by design
// (it only works from the origins you list in Google Cloud).
//
// Google Calendar sync: paste your OAuth Web client ID below. Steps in app/CALENDAR_SETUP.md.
// Leave it empty and the "Connect Google Calendar" button stays disabled with an explanation.
export const GOOGLE_CLIENT_ID = '';

// Firebase web app (project taskflow-dailytracker): used for "Sign in with Google".
// Also public by design; access is limited by the authorised domains in Firebase Authentication.
export const FIREBASE = {
  apiKey: 'AIzaSyD7EE6-jpfNsSaMF1jVTYl19-5JCSR62bo',
  // Google's sign-in only returns to addresses it has on its list; this is the one it knows (see the web.app note in account.js)
  authDomain: 'taskflow-dailytracker.firebaseapp.com',
  projectId: 'taskflow-dailytracker',
  storageBucket: 'taskflow-dailytracker.firebasestorage.app',
  messagingSenderId: '1033081200615',
  appId: '1:1033081200615:web:8890deabb080b7044a6742',
};

// Web push (reminders): the public half of the VAPID key pair. The private half is a GitHub secret.
export const VAPID_PUBLIC_KEY = 'BFFYPUwZevP1hkruSRWVdhcjH8aI0oBBRj_wtq8IJSneQZ90C1BZ5znqAE0bSSkg7PB98E4c1Gng4yJiTw1RCVs';
