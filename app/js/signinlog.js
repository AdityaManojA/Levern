// Sign-in diagnostics for the browser console (open DevTools, filter "TaskFlow sign-in"), and for the
// diagnostic log in Settings > Debugging. Logs the steps and error codes only: never emails, tokens or account details.
import { dlog } from './debuglog.js';
const TAG = '[TaskFlow sign-in]';
export const slog = (step, info = {}) => { console.info(TAG, step, info); dlog('sign-in', step, info); };
export const serr = (step, e) => {
  const info = { code: e?.code || null, message: e?.message || String(e) };
  console.warn(TAG, step, 'failed', info); dlog('sign-in', `${step} failed`, info);
};
