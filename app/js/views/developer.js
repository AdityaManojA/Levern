// Settings → Developer: API keys and webhooks. Talks to /sync/dev on the TaskFlow server, which only
// answers the app on this computer, so keys can't be created from anywhere else.
import { esc, ICON, toast, play, confirmBox } from '../ui.js';
import { syncEnabled, syncStatus } from '../sync.js';
import { swap } from '../motion.js';

const EVENTS = [['quest.created', 'Quest created'], ['quest.updated', 'Quest updated'], ['quest.completed', 'Quest completed'], ['quest.deleted', 'Quest deleted'], ['reminder.fired', 'Reminder went off']];
let keys = null, hooks = null, deliveries = [], newKey = null, newSecret = null, error = null, loading = false;

async function dev(method, path, body) {
  const r = await fetch('sync/dev' + path, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  if (r.status === 204) return null;
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error?.message || `Error ${r.status}`);
  return data;
}
async function load() {
  loading = true;
  try {
    const [k, h] = await Promise.all([dev('GET', '/keys'), dev('GET', '/webhooks')]);
    keys = k.data; hooks = h.data; deliveries = h.deliveries || []; error = null;
  } catch (e) { error = e.message; }
  loading = false;
  rerender();
}
const fmt = iso => iso ? new Date(iso).toLocaleString([], { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : 'never';
const base = () => location.origin + '/api/v1';

export function render() {
  if (!keys && !loading && !error) setTimeout(load, 0);
  const st = syncStatus();
  const head = `<a class="back" href="#/settings">${ICON.back} Settings</a>
    <div class="h-sub">Connect TaskFlow to other apps</div><h1 class="h-title">Developer</h1>`;
  if (!syncEnabled()) return head + `<div class="card"><h3>Needs the TaskFlow server</h3><p class="small">API keys and webhooks live on the TaskFlow server. Start it with <code>npm start</code> and open TaskFlow from <b>http://localhost:5190</b> on this computer.</p></div>`;
  if (error) return head + `<div class="card alert"><h3>Can't open the developer settings</h3><p class="small">${esc(error)}</p><button class="mini" data-act="dev-reload" style="margin-top:8px">Try again</button></div>`;
  if (!keys) return head + '<div class="card"><p class="small">Loading…</p></div>';
  return head + `
    <div class="card">
      <h3>Your API</h3>
      <p class="small">Base URL <code>${esc(base())}</code>. Send your key in an <code>Authorization: Bearer …</code> header. Full reference: <a href="API.md" target="_blank" rel="noopener">API.md</a>.</p>
      <p class="small" style="margin-top:6px">Data sync: ${st.online ? `connected${st.lastSync ? ', last synced ' + esc(fmt(new Date(st.lastSync).toISOString())) : ''}` : esc(st.error || 'not connected')}.</p>
    </div>

    <div class="sec">API keys</div>
    ${newKey ? `<div class="card" style="background:var(--tint-mint)">
      <h3>Copy your new key now</h3>
      <p class="small" style="color:var(--ink)">This is the only time it's shown. TaskFlow keeps only a fingerprint of it.</p>
      <div class="keybox"><code data-key>${esc(newKey)}</code><button class="mini" data-act="copy-key">Copy</button></div>
      <button class="link" data-act="hide-key" style="margin-top:8px">I've saved it</button>
    </div>` : ''}
    <div class="card">
      ${keys.length ? keys.map(k => `<div class="srow"><div class="l"><b>${esc(k.name)}</b><small><code>${esc(k.prefix)}…</code> · ${k.scope === 'write' ? 'read &amp; write' : 'read only'} · created ${esc(fmt(k.created_at))} · last used ${esc(fmt(k.last_used_at))}</small></div>
        <button class="mini" data-act="revoke-key" data-id="${esc(k.id)}" data-name="${esc(k.name)}">Revoke</button></div>`).join('') : '<p class="small">No keys yet.</p>'}
      <form class="devform" data-form="key">
        <label class="lbl" for="key-name" style="margin-top:12px">New key</label>
        <input class="field" id="key-name" name="name" placeholder="What it's for, e.g. Zapier" maxlength="60" required>
        <div class="seg" style="margin:8px 0" role="radiogroup" aria-label="Access">
          <label class="segopt"><input type="radio" name="scope" value="read" checked><span>Read only</span></label>
          <label class="segopt"><input type="radio" name="scope" value="write"><span>Read &amp; write</span></label>
        </div>
        <button class="btn sm" type="submit">Create key</button>
      </form>
    </div>

    <div class="sec">Webhooks</div>
    ${newSecret ? `<div class="card" style="background:var(--tint-mint)"><h3>Signing secret</h3><p class="small" style="color:var(--ink)">Use it to check the <code>TaskFlow-Signature</code> header (API.md shows how). Shown once.</p>
      <div class="keybox"><code data-key>${esc(newSecret)}</code><button class="mini" data-act="copy-key">Copy</button></div><button class="link" data-act="hide-key" style="margin-top:8px">I've saved it</button></div>` : ''}
    <div class="card">
      ${hooks.length ? hooks.map(h => `<div class="srow"><div class="l"><b style="word-break:break-all">${esc(h.url)}</b><small>${h.events.map(esc).join(', ')}</small></div>
        <div style="display:flex;gap:6px;flex:none"><button class="mini" data-act="test-hook" data-id="${esc(h.id)}">Send test</button><button class="mini" data-act="del-hook" data-id="${esc(h.id)}">Remove</button></div></div>`).join('') : '<p class="small">No webhooks yet. TaskFlow will POST to your URL when things happen.</p>'}
      <form class="devform" data-form="hook">
        <label class="lbl" for="hook-url" style="margin-top:12px">New webhook</label>
        <input class="field" id="hook-url" name="url" type="url" placeholder="https://example.com/taskflow" required>
        <div class="evs">${EVENTS.map(([v, l]) => `<label><input type="checkbox" name="events" value="${v}" ${v !== 'quest.updated' ? 'checked' : ''}> ${l} <code>${v}</code></label>`).join('')}</div>
        <button class="btn sm" type="submit">Add webhook</button>
      </form>
    </div>
    ${deliveries.length ? `<div class="sec">Recent deliveries <button class="link" data-act="dev-reload">Refresh</button></div><div class="card">
      ${deliveries.slice(0, 15).map(d => `<div class="hist"><span>${d.ok ? '✓' : '✗'} <code>${esc(d.type)}</code> → ${esc(new URL(d.url).host)}</span><span class="small">${d.ok ? d.status : esc(d.error || String(d.status))}${d.attempt > 1 && d.attempt <= 4 ? ` · try ${d.attempt}` : ''}${d.retry_in_ms ? ' · retrying' : ''} · ${esc(fmt(d.at))}</span></div>`).join('')}
    </div>` : ''}`;
}

export function mount(main) {
  main.querySelectorAll('[data-form]').forEach(f => f.addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(f);
    try {
      if (f.dataset.form === 'key') { const r = await dev('POST', '/keys', { name: fd.get('name'), scope: fd.get('scope') }); newKey = r.key; newSecret = null; toast('Key created'); }
      else { const r = await dev('POST', '/webhooks', { url: fd.get('url'), events: fd.getAll('events') }); newSecret = r.secret; newKey = null; toast('Webhook added'); }
      play('click', 0.5); await load();
    } catch (err) { toast(err.message); }
  }));
}

export const actions = {
  'dev-reload': () => { keys = null; error = null; load(); },
  'copy-key': async el => { const t = el.parentElement.querySelector('[data-key]').textContent; try { await navigator.clipboard.writeText(t); toast('Copied'); } catch (e) { toast('Select the text and copy it'); } },
  'hide-key': () => { newKey = null; newSecret = null; rerender(); },
  'revoke-key': async el => {
    if (!(await confirmBox(`Revoke "${el.dataset.name}"? Anything using it stops working straight away.`, 'Revoke'))) return;
    try { await dev('DELETE', '/keys/' + el.dataset.id); toast('Key revoked'); await load(); } catch (e) { toast(e.message); }
  },
  'del-hook': async el => {
    if (!(await confirmBox('Remove this webhook?', 'Remove'))) return;
    try { await dev('DELETE', '/webhooks/' + el.dataset.id); await load(); } catch (e) { toast(e.message); }
  },
  'test-hook': async el => {
    el.disabled = true; el.textContent = 'Sending…';
    try { const r = await dev('POST', '/webhooks/' + el.dataset.id + '/test'); deliveries = r.deliveries; toast(r.ok ? 'Test delivered' : 'Test failed. See the delivery log.'); rerender(); }
    catch (e) { toast(e.message); el.disabled = false; el.textContent = 'Send test'; }
  },
};
function rerender() { if (document.getElementById('view').dataset.view === 'developer') { swap(render()); mount(document.getElementById('view')); } }
