import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
test('offline shell contains every application JavaScript module', () => {
  const app = new URL('../', import.meta.url);
  const worker = readFileSync(new URL('sw.js', app), 'utf8');
  const shell = new Set([...worker.matchAll(/'([^']+\.js)'/g)].map(match => match[1]));
  const modules = readdirSync(new URL('js/', app), { recursive: true })
    .filter(file => file.endsWith('.js')).map(file => 'js/' + file.replaceAll('\\', '/'));
  assert.deepEqual(modules.filter(file => !shell.has(file)), [], 'missing modules prevent startup offline');
  for (const file of shell) assert.doesNotThrow(() => readFileSync(new URL(file, app)), file);
});
import vm from 'node:vm';
const workerSource = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
function workerHarness(cached) {
  const handlers = {}, network = [];
  const cache = { match: async () => cached, put: async () => {} };
  vm.runInNewContext(workerSource, {
    self: { location: { href: 'https://getlevern.web.app/sw.js' }, addEventListener: (name, fn) => { handlers[name] = fn; } },
    location: { origin: 'https://getlevern.web.app' }, URL, Response,
    caches: { open: async () => cache, match: async () => cached },
    fetch: async req => { network.push(req.url); return new Response('network'); },
  });
  return { handlers, network };
}
test('cached startup modules return without a network request', async () => {
  const cached = new Response('cached module');
  const { handlers, network } = workerHarness(cached);
  let response;
  handlers.fetch({ request: { method: 'GET', url: 'https://getlevern.web.app/js/main.js' }, respondWith: p => { response = p; } });
  assert.equal(await (await response).text(), 'cached module');
  assert.equal(network.length, 0);
});
test('live API requests bypass the app shell cache', () => {
  const { handlers } = workerHarness(new Response('cached'));
  let intercepted = false;
  handlers.fetch({ request: { method: 'GET', url: 'https://getlevern.web.app/api/profile' }, respondWith: () => { intercepted = true; } });
  assert.equal(intercepted, false);
});
