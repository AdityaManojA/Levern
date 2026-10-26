// Storage adapter. Everything the app saves goes through this one small interface, so the
// localStorage backend can later be swapped for IndexedDB, a sync server (team use) or a native
// store in a mobile wrapper (e.g. Capacitor Preferences) without touching the rest of the app.
//
//   adapter.load()        -> state object or null
//   adapter.save(state)   -> void (may be async)
//   adapter.clear()       -> void

export function localAdapter(key) {
  return {
    load() { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { return null; } },
    save(state) { try { localStorage.setItem(key, JSON.stringify(state)); } catch (e) { console.warn('Levern: could not save', e); } },
    clear() { try { localStorage.removeItem(key); } catch (e) {} },
  };
}

// In-memory adapter (tests, or when storage is blocked)
export function memoryAdapter(initial = null) {
  let data = initial;
  return { load: () => data && JSON.parse(JSON.stringify(data)), save: s => { data = JSON.parse(JSON.stringify(s)); }, clear: () => { data = null; } };
}

// Tiny IndexedDB key-value store shared with the service worker (sw.js keeps its own copy of this,
// because a classic service worker cannot import ES modules everywhere).
const DB = 'taskflow-sw', STORE = 'kv';
function db() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
export const kv = {
  async get(k) { const d = await db(); return new Promise(res => { const r = d.transaction(STORE).objectStore(STORE).get(k); r.onsuccess = () => res(r.result); r.onerror = () => res(undefined); }); },
  async set(k, v) { const d = await db(); return new Promise(res => { const t = d.transaction(STORE, 'readwrite'); t.objectStore(STORE).put(v, k); t.oncomplete = () => res(); t.onerror = () => res(); }); },
};
