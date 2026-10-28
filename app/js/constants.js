// Levern architectural constants & abstraction layer.
// Preserves backward compatibility with deployed Firestore collections and client storage.

export const FIRESTORE_COLLECTIONS = Object.freeze({
  USERS: 'taskflowUsers',
  PROFILES: 'taskflowProfiles',
  BOARD: 'taskflowBoard',
  FEEDBACK: 'taskflowFeedback',
});

export const STORAGE_KEYS = Object.freeze({
  STATE: 'taskflow.v1',
  ACCOUNT: 'taskflow-account',
  SIGNIN_REDIRECT: 'taskflow-signin-redirect',
  THEME: 'taskflow-theme',
  EVENTS: 'taskflow-events',
  DEBUG_ON: 'taskflow-debug',
  DEBUG_LOG: 'taskflow-debug-log',
  LB_NUDGE: 'taskflow-lb-nudge',
  NUDGES_FIRED: 'taskflow-nudges-fired',
  DEVICE_SETUP: 'taskflow-device-setup',
});

export const SW_CONFIG = Object.freeze({
  CACHE_VERSION: 'taskflow-v80',
  DB_NAME: 'taskflow-sw',
  DB_STORE: 'kv',
  SYNC_TAG: 'taskflow-reminders',
});
