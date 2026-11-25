/**
 * AETHERBUILDER - Vercel Serverless Function API Route
 * ====================================================
 * Maps /api.php and /api requests to serverless execution.
 * Completely compatible with Vercel, Supabase, Vercel KV / Upstash, and Cloudinary.
 */

import crypto from 'crypto';
import db from './db.js';
import cloudinary from './cloudinary.js';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, DELETE',
  'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Password, X-Admin-Token, X-Portal-Token, Authorization'
};

function sendJson(res, statusCode, data) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  for (const [k, v] of Object.entries(corsHeaders)) {
    res.setHeader(k, v);
  }
  res.end(JSON.stringify(data));
}

async function parseBody(req) {
  if (req.body) {
    if (typeof req.body === 'object') return req.body;
    try { return JSON.parse(req.body); } catch { return req.body; }
  }
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      const buf = Buffer.concat(chunks);
      const str = buf.toString('utf8');
      try { resolve(JSON.parse(str)); } catch { resolve(str); }
    });
    req.on('error', () => resolve({}));
  });
}

export default async function handler(req, res) {
  // CORS Preflight
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    for (const [k, v] of Object.entries(corsHeaders)) {
      res.setHeader(k, v);
    }
    return res.end();
  }

  // Parse action from query or URL
  const url = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));
  const action = req.query?.action || url.searchParams.get('action') || '';

  try {
    // ── CONFIGURATION & HEALTH ──────────────────────────────────────────────
    if (action === 'get_config') {
      return sendJson(res, 200, {
        success: true,
        version: '2.9.57',
        db: db.getInfo(),
        cloudinary: cloudinary.getConfig()
      });
    }

    // ── GET SITE ────────────────────────────────────────────────────────────
    if (req.method === 'GET' && action === 'get_site') {
      let siteData = await db.get('aether:site');
      if (!siteData) {
        // Fallback: try reading bundled data/site.json
        try {
          const fs = await import('fs');
          const path = await import('path');
          const p = path.join(process.cwd(), 'data', 'site.json');
          if (fs.existsSync(p)) {
            siteData = JSON.parse(fs.readFileSync(p, 'utf8'));
          }
        } catch {}
      }
      if (siteData) {
        return sendJson(res, 200, siteData);
      }
      return sendJson(res, 200, {
        publishedAt: new Date().toISOString(),
        pages: [],
        siteSettings: { siteTitle: 'Aether Site' }
      });
    }

    // ── PUBLISH SITE ────────────────────────────────────────────────────────
    if (req.method === 'POST' && action === 'publish') {
      const body = await parseBody(req);
      if (!body || (typeof body !== 'object')) {
        return sendJson(res, 400, { error: 'Invalid JSON payload' });
      }
      await db.set('aether:site', body);
      return sendJson(res, 200, {
        ok: true,
        success: true,
        message: 'Site published successfully',
        db: db.getInfo()
      });
    }

    // ── CLOUDINARY SIGNATURE (Direct browser upload) ────────────────────────
    if (action === 'cloudinary_sign') {
      try {
        const ticket = cloudinary.createSignature();
        return sendJson(res, 200, { success: true, ...ticket });
      } catch (err) {
        return sendJson(res, 400, { success: false, error: err.message });
      }
    }

    // ── CLOUDINARY ASSET REGISTRATION ───────────────────────────────────────
    if (req.method === 'POST' && action === 'cloudinary_register') {
      const body = await parseBody(req);
      const registered = await cloudinary.registerAsset(body);
      return sendJson(res, 200, { success: true, asset: registered });
    }

    // ── LIST ASSETS ─────────────────────────────────────────────────────────
    if (req.method === 'GET' && action === 'list_assets') {
      const assets = await cloudinary.listAllAssets();
      return sendJson(res, 200, { success: true, assets });
    }

    // ── DELETE ASSET ────────────────────────────────────────────────────────
    if (req.method === 'POST' && action === 'delete_asset') {
      const body = await parseBody(req);
      const name = body?.name || body?.url || body?.public_id;
      if (!name) return sendJson(res, 400, { success: false, error: 'No asset identifier provided' });
      await cloudinary.deleteAsset(name);
      return sendJson(res, 200, { success: true, message: 'Asset deleted' });
    }

    // ── RENAME ASSET ────────────────────────────────────────────────────────
    if (req.method === 'POST' && action === 'rename_asset') {
      const body = await parseBody(req);
      const oldName = body?.old_name;
      const newName = body?.new_name;
      if (!oldName || !newName) return sendJson(res, 400, { success: false, error: 'Missing name parameters' });

      let assets = await db.get('aether:assets', []);
      if (Array.isArray(assets)) {
        assets = assets.map(a => a.name === oldName ? { ...a, name: newName } : a);
        await db.set('aether:assets', assets);
      }
      return sendJson(res, 200, { success: true, message: 'Asset renamed' });
    }

    // ── SUBMIT FORM ─────────────────────────────────────────────────────────
    if (req.method === 'POST' && action === 'submit_form') {
      const entry = await parseBody(req);

      // Anti-spam honeypot check
      if (entry._hp || entry.website_hp) {
        return sendJson(res, 200, { success: true, message: 'Submission logged.' });
      }

      let subs = await db.get('aether:submissions', []);
      if (!Array.isArray(subs)) subs = [];

      const subId = 'sub_' + Math.floor(Date.now() / 1000) + '_' + Math.random().toString(36).substr(2, 6);
      const nameVal = entry.name || entry.FullName || entry.fullName || entry.full_name || '';
      const emailVal = entry.email || entry.Email || '';
      const phoneVal = entry.phone || entry.Phone || entry.mobile || entry.Mobile || '';

      const cleanEntry = {
        id: subId,
        submitted_at: new Date().toISOString(),
        is_read: false,
        type: entry.type || 'contact',
        name: nameVal || 'Anonymous',
        email: emailVal,
        phone: phoneVal,
        message: entry.message || '',
        page: entry.page || 'home',
        extra: entry.extra || { ...entry },
        ...entry
      };

      cleanEntry.id = subId;
      cleanEntry.submitted_at = new Date().toISOString();
      cleanEntry.is_read = false;
      cleanEntry.name = nameVal || cleanEntry.name || 'Anonymous';
      cleanEntry.email = emailVal || cleanEntry.email || '';
      cleanEntry.phone = phoneVal || cleanEntry.phone || '';
      delete cleanEntry._hp;
      delete cleanEntry.website_hp;

      subs.unshift(cleanEntry);
      if (subs.length > 1000) subs = subs.slice(0, 1000);

      await db.set('aether:submissions', subs);
      return sendJson(res, 200, {
        success: true,
        id: subId,
        message: 'Submission received successfully!'
      });
    }

    // ── GET SUBMISSIONS ─────────────────────────────────────────────────────
    if (req.method === 'GET' && action === 'get_submissions') {
      let subs = await db.get('aether:submissions', []);
      if (!Array.isArray(subs)) subs = [];
      const unreadCount = subs.filter(s => !s.is_read).length;
      return sendJson(res, 200, {
        success: true,
        submissions: subs,
        unreadCount,
        totalCount: subs.length
      });
    }

    // ── MARK READ ───────────────────────────────────────────────────────────
    if (req.method === 'POST' && action === 'mark_read') {
      const body = await parseBody(req);
      const id = body?.id;
      let subs = await db.get('aether:submissions', []);
      if (Array.isArray(subs)) {
        subs.forEach(s => {
          if (!id || s.id === id) s.is_read = true;
        });
        await db.set('aether:submissions', subs);
      }
      return sendJson(res, 200, { success: true });
    }

    // ── DELETE SUBMISSION ───────────────────────────────────────────────────
    if (req.method === 'POST' && action === 'delete_submission') {
      const body = await parseBody(req);
      const id = body?.id;
      let subs = await db.get('aether:submissions', []);
      if (Array.isArray(subs) && id) {
        subs = subs.filter(s => s.id !== id);
        await db.set('aether:submissions', subs);
      }
      return sendJson(res, 200, { success: true });
    }

    // ── CLEAR SUBMISSIONS ───────────────────────────────────────────────────
    if (action === 'clear_submissions') {
      await db.set('aether:submissions', []);
      return sendJson(res, 200, { success: true, message: 'All submissions cleared.' });
    }

    // ── EXPORT SUBMISSIONS CSV ──────────────────────────────────────────────
    if (req.method === 'GET' && action === 'export_submissions_csv') {
      let subs = await db.get('aether:submissions', []);
      if (!Array.isArray(subs)) subs = [];

      const escapeCsv = (val) => {
        if (val === null || val === undefined) return '""';
        return `"${String(val).replace(/"/g, '""')}"`;
      };

      const rows = [
        ['ID', 'Date Submitted', 'Status', 'Source', 'Name', 'Email', 'Phone', 'Page', 'Message']
      ];
      subs.forEach(s => {
        rows.push([
          s.id || '',
          s.submitted_at || '',
          s.is_read ? 'Read' : 'New',
          s.type || 'contact',
          s.name || '',
          s.email || '',
          s.phone || '',
          s.page || '',
          s.message || ''
        ]);
      });

      const csvContent = '\uFEFF' + rows.map(r => r.map(escapeCsv).join(',')).join('\r\n');
      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="submissions.csv"');
      for (const [k, v] of Object.entries(corsHeaders)) {
        res.setHeader(k, v);
      }
      return res.end(csvContent);
    }

    // ── ADDONS (get_addons, save_addons) ────────────────────────────────────
    if (req.method === 'GET' && action === 'get_addons') {
      let addons = await db.get('aether:addons', []);
      return sendJson(res, 200, { success: true, addons: Array.isArray(addons) ? addons : [] });
    }
    if (req.method === 'POST' && action === 'save_addons') {
      const payload = await parseBody(req);
      await db.set('aether:addons', Array.isArray(payload) ? payload : []);
      return sendJson(res, 200, { success: true, message: 'Add-ons saved successfully' });
    }

    // ── REVISIONS (get_revisions, save_revision, rollback_revision) ─────────
    if (req.method === 'GET' && action === 'get_revisions') {
      let revs = await db.get('aether:revisions', []);
      if (!Array.isArray(revs)) revs = [];
      const meta = revs.map(r => ({
        id: r.id || '',
        saved_at: r.saved_at || new Date().toISOString(),
        formattedDate: r.formattedDate || new Date().toLocaleString(),
        siteName: r.siteName || (r.snapshot?.siteSettings?.siteTitle || 'Aether Site'),
        pageCount: r.pageCount || (r.snapshot?.pages?.length || 1),
        totalSections: r.totalSections || 0,
        sizeBytes: r.sizeBytes || 1024
      }));
      return sendJson(res, 200, { success: true, revisions: meta });
    }

    if (req.method === 'POST' && action === 'save_revision') {
      const body = await parseBody(req);
      let revs = await db.get('aether:revisions', []);
      if (!Array.isArray(revs)) revs = [];

      const newRev = {
        ...body,
        id: 'rev_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
        saved_at: new Date().toISOString(),
        label: body.label || 'Auto-save'
      };
      revs.unshift(newRev);
      if (revs.length > 20) revs = revs.slice(0, 20);
      await db.set('aether:revisions', revs);
      return sendJson(res, 200, { success: true, id: newRev.id });
    }

    if (req.method === 'POST' && action === 'rollback_revision') {
      const body = await parseBody(req);
      const targetId = body?.revisionId || body?.id;
      let revs = await db.get('aether:revisions', []);
      if (!Array.isArray(revs)) revs = [];

      const rev = revs.find(r => r.id === targetId);
      if (!rev) return sendJson(res, 404, { success: false, error: 'Revision not found' });
      const snapshot = rev.snapshot || rev;
      await db.set('aether:site', snapshot);
      return sendJson(res, 200, { success: true, message: 'Restored successfully' });
    }

    // ── MARQUEE IMAGES ──────────────────────────────────────────────────────
    if (req.method === 'GET' && action === 'get_marquee_images') {
      let items = await db.get('aether:marquee', []);
      if (!Array.isArray(items) || items.length === 0) {
        items = [
          { imageUrl: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=500&q=80", tooltipText: "Project Alpha", link: "" },
          { imageUrl: "https://images.unsplash.com/photo-1618005192384-a83a8bd57fbe?w=500&q=80", tooltipText: "Project Beta", link: "" },
          { imageUrl: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=500&q=80", tooltipText: "Project Gamma", link: "" },
          { imageUrl: "https://images.unsplash.com/photo-1550684848-fac1c5b4e853?w=500&q=80", tooltipText: "Project Delta", link: "" }
        ];
        await db.set('aether:marquee', items);
      }
      return sendJson(res, 200, { success: true, source: 'cloud_ready', items });
    }

    // ── PORTAL AUTH & DATA ──────────────────────────────────────────────────
    if (action === 'portal_init') {
      const subs = await db.get('aether:submissions', []);
      const stats = { total: subs.length, pending: 0, approved: 0, paid: 0, declined: 0 };
      subs.forEach(s => {
        const st = (s.status || 'pending').toLowerCase();
        if (st in stats) stats[st]++; else stats.pending++;
      });
      return sendJson(res, 200, { success: true, loggedIn: false, stats, dbInfo: db.getInfo() });
    }

    if (req.method === 'POST' && (action === 'verify_session' || action === 'login')) {
      const devToken = 'tok_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
      return sendJson(res, 200, { success: true, token: devToken });
    }

    // Default 400 for unknown action
    return sendJson(res, 400, {
      error: `Unknown action: ${action}`,
      hint: 'Supported actions: get_site, publish, list_assets, cloudinary_sign, cloudinary_register, submit_form, get_submissions, get_addons, save_addons, get_revisions, save_revision, rollback_revision, get_config'
    });
  } catch (err) {
    console.error(`[API Handler Error] action=${action}:`, err);
    return sendJson(res, 500, { success: false, error: err.message });
  }
}
