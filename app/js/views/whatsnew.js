// Settings → What's new: every update, newest first (data in changelog.js).
import { CHANGELOG } from '../changelog.js';
import { esc } from '../ui.js';

const day = iso => new Date(iso + 'T12:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });

export function render() {
  return `
    <div class="h-sub">Every update</div>
    <h1 class="h-title">What's new</h1>
    <a class="lb-back" href="#/settings">‹ Settings</a>
    ${CHANGELOG.map((r, i) => `<div class="card wn">
      <div class="wn-h"><span class="wn-v">${esc(r.v)}</span><span class="small">${esc(day(r.date))}</span>${i === 0 ? '<span class="wn-new">Latest</span>' : ''}</div>
      <h3>${esc(r.title)}</h3>
      <ul>${r.items.map(t => `<li>${esc(t)}</li>`).join('')}</ul>
    </div>`).join('')}`;
}
