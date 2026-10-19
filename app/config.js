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
  authDomain: 'taskflow-dailytracker.firebaseapp.com',
  projectId: 'taskflow-dailytracker',
  storageBucket: 'taskflow-dailytracker.firebasestorage.app',
  messagingSenderId: '1033081200615',
  appId: '1:1033081200615:web:8890deabb080b7044a6742',
};
