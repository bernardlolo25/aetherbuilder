/**
 * AETHERBUILDER - Universal Storage & Database Adapter
 * =====================================================
 * Supports:
 *   1. Vercel KV / Upstash Redis (Serverless REST - 0 extra npm dependencies)
 *   2. Supabase (PostgREST table store - 0 extra npm dependencies)
 *   3. Local Filesystem (Node.js fs / data/*.json fallback)
 */

import fs from 'fs';
import path from 'path';

// Memory fallback store for read-only environments
const memoryCache = new Map();

// Map logical database keys to local JSON files in data/
const FILE_MAP = {
  'aether:site': 'site.json',
  'aether:submissions': 'submissions.json',
  'aether:revisions': 'revisions.json',
  'aether:addons': 'addons.json',
  'aether:assets': 'assets_meta.json',
  'aether:portal_users': 'portal_users.json',
  'aether:portal_sessions': 'portal_sessions.json',
  'aether:marquee': 'marquee_items.json',
  'aether:store_feed': 'store_feed.json'
};

function getLocalFilePath(key) {
  const root = process.cwd();
  const fileName = FILE_MAP[key] || `${key.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`;
  const candidates = [
    path.join(root, 'data', fileName),
    path.join('/tmp', fileName),
    path.join('/var/task', 'data', fileName),
    path.join(root, fileName)
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return path.join(root, 'data', fileName);
}

function getTmpFilePath(key) {
  const fileName = FILE_MAP[key] || `${key.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`;
  return path.join('/tmp', fileName);
}

// ── Vercel KV / Upstash REST Client ─────────────────────────────────────────
function getUpstashConfig() {
  // Check common explicit names
  let url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || process.env.STORAGE_REST_API_URL || process.env.STORAGE_URL;
  let token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || process.env.STORAGE_REST_API_TOKEN || process.env.STORAGE_TOKEN;

  // Dynamic fallback: detect any custom prefix assigned in Vercel (e.g. *_REST_API_URL)
  if (!url || !token) {
    for (const [k, v] of Object.entries(process.env)) {
      if (k.endsWith('_REST_API_URL') || (k.includes('REDIS') && k.endsWith('_URL')) || k === 'KV_URL') {
        url = url || v;
      }
      if (k.endsWith('_REST_API_TOKEN') || (k.includes('REDIS') && k.endsWith('_TOKEN')) || k === 'KV_REST_API_READ_ONLY_TOKEN') {
        token = token || v;
      }
    }
  }

  if (url && token) {
    return { url: url.replace(/\/$/, ''), token };
  }
  return null;
}

async function upstashGet(key) {
  const cfg = getUpstashConfig();
  if (!cfg) return null;
  const res = await fetch(`${cfg.url}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${cfg.token}` },
    cache: 'no-store'
  });
  if (!res.ok) return null;
  const data = await res.json();
  if (data.result === null || data.result === undefined) return null;
  if (typeof data.result === 'string') {
    try {
      return JSON.parse(data.result);
    } catch {
      return data.result;
    }
  }
  return data.result;
}

async function upstashSet(key, value) {
  const cfg = getUpstashConfig();
  if (!cfg) return false;
  const valStr = typeof value === 'string' ? value : JSON.stringify(value);
  const res = await fetch(`${cfg.url}/set/${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(valStr)
  });
  return res.ok;
}

async function upstashDel(key) {
  const cfg = getUpstashConfig();
  if (!cfg) return false;
  const res = await fetch(`${cfg.url}/del/${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.token}` }
  });
  return res.ok;
}

// ── Supabase Client (REST via PostgREST) ─────────────────────────────────────
function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY;
  if (url && key) {
    return { url: url.replace(/\/$/, ''), key };
  }
  return null;
}

async function supabaseGet(key) {
  const cfg = getSupabaseConfig();
  if (!cfg) return null;
  try {
    const res = await fetch(`${cfg.url}/rest/v1/aether_store?key=eq.${encodeURIComponent(key)}&select=value`, {
      headers: {
        apikey: cfg.key,
        Authorization: `Bearer ${cfg.key}`,
        'Content-Type': 'application/json'
      },
      cache: 'no-store'
    });
    if (!res.ok) return null;
    const rows = await res.json();
    if (Array.isArray(rows) && rows.length > 0) {
      return rows[0].value;
    }
  } catch {
    return null;
  }
  return null;
}

async function supabaseSet(key, value) {
  const cfg = getSupabaseConfig();
  if (!cfg) return false;
  try {
    const res = await fetch(`${cfg.url}/rest/v1/aether_store`, {
      method: 'POST',
      headers: {
        apikey: cfg.key,
        Authorization: `Bearer ${cfg.key}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates'
      },
      body: JSON.stringify({
        key,
        value,
        updated_at: new Date().toISOString()
      })
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ── Local File System ───────────────────────────────────────────────────────
function localFsGet(key, defaultValue = null) {
  if (memoryCache.has(key)) {
    return memoryCache.get(key);
  }
  const filePath = getLocalFilePath(key);
  if (fs.existsSync(filePath)) {
    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(raw);
    } catch {
      return defaultValue;
    }
  }
  // Try /tmp for serverless environments
  try {
    const tmpPath = getTmpFilePath(key);
    if (fs.existsSync(tmpPath)) {
      const raw = fs.readFileSync(tmpPath, 'utf8');
      return JSON.parse(raw);
    }
  } catch {}

  return defaultValue;
}

function localFsSet(key, value) {
  memoryCache.set(key, value);
  const filePath = getLocalFilePath(key);
  const jsonStr = JSON.stringify(value, null, 2);
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, jsonStr, 'utf8');
    return true;
  } catch {
    // If local fs is read-only (like Vercel serverless without KV), write to /tmp
    try {
      const tmpPath = getTmpFilePath(key);
      fs.writeFileSync(tmpPath, jsonStr, 'utf8');
      return true;
    } catch (err) {
      console.warn(`[db] Write failed to both local fs and /tmp for key ${key}:`, err.message);
      return false;
    }
  }
}

// ── Unified Database Interface ──────────────────────────────────────────────
export const db = {
  /**
   * Retrieves an item from the active database backend.
   */
  async get(key, defaultValue = null) {
    // 1. Upstash Redis / Vercel KV
    if (getUpstashConfig()) {
      try {
        const val = await upstashGet(key);
        if (val !== null && val !== undefined) return val;
      } catch (err) {
        console.warn(`[db:upstash] Error fetching key "${key}":`, err.message);
      }
    }

    // 2. Supabase
    if (getSupabaseConfig()) {
      try {
        const val = await supabaseGet(key);
        if (val !== null && val !== undefined) return val;
      } catch (err) {
        console.warn(`[db:supabase] Error fetching key "${key}":`, err.message);
      }
    }

    // 3. Local Filesystem / Memory Fallback
    return localFsGet(key, defaultValue);
  },

  /**
   * Saves an item to the active database backend.
   */
  async set(key, value) {
    let saved = false;

    // 1. Upstash Redis / Vercel KV
    if (getUpstashConfig()) {
      try {
        saved = await upstashSet(key, value);
      } catch (err) {
        console.warn(`[db:upstash] Error setting key "${key}":`, err.message);
      }
    }

    // 2. Supabase
    if (getSupabaseConfig()) {
      try {
        const supSaved = await supabaseSet(key, value);
        if (supSaved) saved = true;
      } catch (err) {
        console.warn(`[db:supabase] Error setting key "${key}":`, err.message);
      }
    }

    // Always mirror to local /tmp / memory as well
    localFsSet(key, value);

    return saved || !getUpstashConfig();
  },

  /**
   * Deletes a key from the active database backend.
   */
  async del(key) {
    memoryCache.delete(key);
    if (getUpstashConfig()) {
      try {
        await upstashDel(key);
      } catch {}
    }
    try {
      const filePath = getLocalFilePath(key);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch {}
    return true;
  },

  /**
   * Reports the current database configuration status.
   */
  getInfo() {
    if (getUpstashConfig()) {
      return {
        provider: 'upstash-kv',
        connected: true,
        label: 'Vercel KV / Upstash Redis'
      };
    }
    if (getSupabaseConfig()) {
      return {
        provider: 'supabase',
        connected: true,
        label: 'Supabase PostgreSQL'
      };
    }
    return {
      provider: 'local-fs',
      connected: true,
      label: 'Local File System (data/*.json)',
      warning: process.env.VERCEL ? 'Running on Vercel without persistent KV. Set KV_REST_API_URL or SUPABASE_URL to persist site updates across deployments.' : null
    };
  }
};

export default db;
