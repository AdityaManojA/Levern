// API keys. A key looks like tf_<32 random chars>; only its SHA-256 hash is stored, plus a short
// prefix so you can tell keys apart in the list. Scope: 'read' or 'write' (write includes read).
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';

const hash = k => createHash('sha256').update(k).digest('hex');
const B62 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const token = n => [...randomBytes(n)].map(b => B62[b % 62]).join('');

export function createKey(db, { name, scope }) {
  name = String(name || '').trim().slice(0, 60);
  if (!name) throw Object.assign(new Error('Give the key a name.'), { status: 422 });
  if (!['read', 'write'].includes(scope)) throw Object.assign(new Error('scope must be "read" or "write"'), { status: 422 });
  const key = 'tf_' + token(32);
  const rec = { id: 'key_' + token(10), name, scope, prefix: key.slice(0, 10), hash: hash(key), createdAt: Date.now(), lastUsedAt: null, revokedAt: null };
  db.doc.keys.push(rec); db.touch();
  return { key, record: publicKey(rec) };
}
export const publicKey = k => ({ id: k.id, name: k.name, scope: k.scope, prefix: k.prefix, created_at: new Date(k.createdAt).toISOString(),
  last_used_at: k.lastUsedAt ? new Date(k.lastUsedAt).toISOString() : null, revoked: !!k.revokedAt });
export function revokeKey(db, id) {
  const k = db.doc.keys.find(x => x.id === id && !x.revokedAt);
  if (!k) return false;
  k.revokedAt = Date.now(); db.touch(); return true;
}
// returns the key record for "Authorization: Bearer tf_…", or null
export function findKey(db, header) {
  const m = /^Bearer\s+(tf_[A-Za-z0-9]{32})\s*$/.exec(header || '');
  if (!m) return null;
  const h = Buffer.from(hash(m[1]), 'hex');
  for (const k of db.doc.keys) {
    if (k.revokedAt) continue;
    const kh = Buffer.from(k.hash, 'hex');
    if (kh.length === h.length && timingSafeEqual(kh, h)) return k;
  }
  return null;
}

// fixed-window rate limit per key (default 120 requests a minute; TASKFLOW_RATE overrides)
const windows = new Map();
export function rateLimit(keyId, limit = +(process.env.TASKFLOW_RATE || 120), windowMs = 60000) {
  const now = Date.now(), w = windows.get(keyId);
  if (!w || now >= w.reset) { const nw = { count: 1, reset: now + windowMs }; windows.set(keyId, nw); return { ok: true, limit, remaining: limit - 1, reset: nw.reset }; }
  w.count++;
  return { ok: w.count <= limit, limit, remaining: Math.max(0, limit - w.count), reset: w.reset };
}
