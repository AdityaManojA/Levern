// A safe handle on Mochi for the rest of the app: every call is a no-op until he exists or while he's hidden.
let m = null;
export const setMascot = x => { m = x; };
const call = (fn, ...a) => { try { return m && m[fn] ? m[fn](...a) : undefined; } catch (e) { console.warn('Mochi:', e); } };
export const mascot = {
  get ready() { return !!m; },
  react: (name, text, mad) => call('react', name, text, mad),
  celebrate: text => call('celebrate', text),
  notify: count => call('notify', count),
  hold: info => call('hold', info),
  release: () => call('release'),
  holding: () => !!call('holding'),
  grumpy: text => call('grumpy', text),
  say: (text, ms, mad) => call('say', text, ms, mad),
  enterPage: page => call('enterPage', page),
  setPerch: p => call('setPerch', p),
  focusMode: on => call('focusMode', on),
  setVisible: on => call('setVisible', on),
  settingsChanged: () => call('settingsChanged'),
  raise: on => call('raise', on),
  away: on => call('away', on),
  rect: () => call('rect'),
  el: () => m && m.el,
};
