// Sign-in diagnostics for the browser console (open DevTools, filter "TaskFlow sign-in").
// Logs the steps and error codes only: never emails, tokens or account details.
const TAG = '[TaskFlow sign-in]';
export const slog = (step, info = {}) => console.info(TAG, step, info);
export const serr = (step, e) => console.warn(TAG, step, 'failed', { code: e?.code || null, message: e?.message || String(e) });
