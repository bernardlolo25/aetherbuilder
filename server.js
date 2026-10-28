const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const ROOT = process.cwd();
const UPLOADS_DIR = path.join(ROOT, 'assets', 'uploads');

// Ensure uploads dir exists
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const MIME = {
  html: 'text/html',
  css: 'text/css',
  js: 'application/javascript',
  json: 'application/json',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  ico: 'image/x-icon',
  woff: 'font/woff',
  woff2: 'font/woff2',
  ttf: 'font/ttf',
  webp: 'image/webp',
  mp4: 'video/mp4',
  webm: 'video/webm',
  pdf: 'application/pdf'
};

const ALLOWED_EXT = new Set(['jpg','jpeg','png','gif','webp','svg','mp4','webm','pdf','json']);

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS,DELETE',
  'Access-Control-Allow-Headers': 'Content-Type,X-Admin-Password'
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function json(res, code, obj) {
  res.writeHead(code, { ...cors, 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}

/**
 * Robust multipart/form-data parser (pure Node, no dependencies).
 * Handles binary file data correctly using Buffer operations.
 */
function parseMultipart(boundary, bodyBuf) {
  const dashBoundary = Buffer.from('--' + boundary);
  const results = [];

  let pos = bodyBuf.indexOf(dashBoundary);
  if (pos === -1) return results;
  pos += dashBoundary.length;

  while (pos < bodyBuf.length) {
    if (bodyBuf[pos] === 0x2d && bodyBuf[pos + 1] === 0x2d) break; // -- = closing boundary
    if (bodyBuf[pos] === 0x0d) pos++;
    if (bodyBuf[pos] === 0x0a) pos++;

    const headerEndMarker = Buffer.from('\r\n\r\n');
    let headerEnd = bodyBuf.indexOf(headerEndMarker, pos);
    let headerSepLen = 4;
    if (headerEnd === -1) {
      const lfMarker = Buffer.from('\n\n');
      headerEnd = bodyBuf.indexOf(lfMarker, pos);
      headerSepLen = 2;
    }
    if (headerEnd === -1) break;

    const headerStr = bodyBuf.slice(pos, headerEnd).toString('utf8');
    pos = headerEnd + headerSepLen;

    const nextBoundary = Buffer.from('\r\n--' + boundary);
    let contentEnd = bodyBuf.indexOf(nextBoundary, pos);
    let nextBoundaryLen = nextBoundary.length;
    if (contentEnd === -1) {
      const lfNextBoundary = Buffer.from('\n--' + boundary);
      contentEnd = bodyBuf.indexOf(lfNextBoundary, pos);
      nextBoundaryLen = lfNextBoundary.length;
    }
    if (contentEnd === -1) break;

    const content = bodyBuf.slice(pos, contentEnd);

    const lines = headerStr.split(/\r?\n/);
    const dispHeader = lines.find(h => /^content-disposition:/i.test(h)) || '';
    const nameMatch = dispHeader.match(/;\s*name=(?:"([^"]+)"|([^\s;]+))/i);
    const fileMatch = dispHeader.match(/;\s*filename=(?:"([^"]+)"|([^\s;]+))/i);
    const mimeHeader = lines.find(h => /^content-type:/i.test(h)) || '';
    const mimeType = mimeHeader.replace(/^content-type:\s*/i, '').trim() || 'application/octet-stream';

    if (nameMatch) {
      results.push({
        fieldName: nameMatch[1] || nameMatch[2],
        fileName: fileMatch ? (fileMatch[1] || fileMatch[2]) : null,
        mimeType,
        content
      });
    }

    pos = contentEnd + nextBoundaryLen;
    if (bodyBuf[pos] === 0x2d && bodyBuf[pos + 1] === 0x2d) break;
  }

  return results;
}

// ── List assets ─────────────────────────────────────────────────────────────
function handleListAssets(res) {
  try {
    const files = fs.readdirSync(UPLOADS_DIR)
      .filter(f => {
        const ext = path.extname(f).slice(1).toLowerCase();
        return ALLOWED_EXT.has(ext);
      })
      .map(f => {
        const fullPath = path.join(UPLOADS_DIR, f);
        const stat = fs.statSync(fullPath);
        const ext = path.extname(f).slice(1).toLowerCase();
        return {
          name: f,
          url: 'assets/uploads/' + f,
          size: stat.size,
          ext: ext,
          modified: Math.floor(stat.mtimeMs / 1000)
        };
      })
      .sort((a, b) => b.modified - a.modified); // newest first

    json(res, 200, { success: true, assets: files });
  } catch (err) {
    json(res, 500, { success: false, error: err.message });
  }
}

// ── Upload asset ─────────────────────────────────────────────────────────────
async function handleUpload(req, res) {
  try {
    const contentType = req.headers['content-type'] || '';
    const boundaryMatch = contentType.match(/boundary=([^;]+)/i);
    if (!boundaryMatch) {
      return json(res, 400, { success: false, error: 'No multipart boundary found in Content-Type' });
    }

    const boundary = boundaryMatch[1].trim().replace(/^"(.*)"$/, '$1');
    const bodyBuf = await readBody(req);

    console.log('Upload: boundary=' + boundary + ', bodySize=' + bodyBuf.length);

    const parts = parseMultipart(boundary, bodyBuf);
    console.log('Upload: parsed', parts.length, 'part(s):', parts.map(p => p.fieldName + (p.fileName ? '→' + p.fileName : '')).join(', '));

    const filePart = parts.find(p => p.fileName);
    if (!filePart) {
      return json(res, 400, { success: false, error: 'No file part found in upload (parts: ' + parts.length + ')' });
    }

    const originalName = filePart.fileName;
    const ext = path.extname(originalName).slice(1).toLowerCase();
    if (!ALLOWED_EXT.has(ext)) {
      return json(res, 415, { success: false, error: 'File type not allowed: .' + ext });
    }

    const overwritePart = parts.find(p => p.fieldName === 'overwrite');
    const isOverwrite = overwritePart && overwritePart.content.toString('utf8').trim() === '1';

    // Sanitize base name and handle duplicate filenames
    const baseName = path.basename(originalName, '.' + ext).replace(/[^a-zA-Z0-9_\-]/g, '_');
    let destName = baseName + '.' + ext;
    if (!isOverwrite) {
      let counter = 1;
      while (fs.existsSync(path.join(UPLOADS_DIR, destName))) {
        destName = baseName + '_' + counter + '.' + ext;
        counter++;
      }
    }

    const destPath = path.join(UPLOADS_DIR, destName);
    fs.writeFileSync(destPath, filePart.content);

    console.log('Uploaded:', destName, '(' + filePart.content.length + ' bytes)');
    json(res, 200, {
      success: true,
      name: destName,
      url: 'assets/uploads/' + destName,
      size: filePart.content.length
    });
  } catch (err) {
    console.error('Upload error:', err);
    json(res, 500, { success: false, error: err.message });
  }
}

// ── Delete asset ─────────────────────────────────────────────────────────────
async function handleDeleteAsset(req, res) {
  try {
    const bodyStr = (await readBody(req)).toString('utf8');
    const { name } = JSON.parse(bodyStr);
    if (!name) return json(res, 400, { success: false, error: 'No filename provided' });

    const safeName = path.basename(name); // prevent path traversal
    const target = path.join(UPLOADS_DIR, safeName);

    if (!fs.existsSync(target)) return json(res, 404, { success: false, error: 'File not found' });
    fs.unlinkSync(target);
    console.log('Deleted:', safeName);
    json(res, 200, { success: true, message: 'Asset deleted.' });
  } catch (err) {
    json(res, 500, { success: false, error: err.message });
  }
}

// ── HTTP Server ───────────────────────────────────────────────────────────────
http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, cors);
    res.end();
    return;
  }

  const url = new URL(req.url, 'http://localhost:' + PORT);
  const pathname = url.pathname;

  if (pathname === '/api.php') {
    const action = url.searchParams.get('action');

    // GET: get_site
    if (req.method === 'GET' && action === 'get_site') {
      try {
        const data = fs.readFileSync(path.join(ROOT, 'data', 'site.json'), 'utf8');
        res.writeHead(200, { ...cors, 'Content-Type': 'application/json' });
        res.end(data);
      } catch {
        json(res, 404, { error: 'not found' });
      }
      return;
    }

    // POST: publish
    if (req.method === 'POST' && action === 'publish') {
      try {
        const body = (await readBody(req)).toString('utf8');
        JSON.parse(body); // Validate JSON
        fs.writeFileSync(path.join(ROOT, 'data', 'site.json'), body, 'utf8');
        console.log('Published to data/site.json');
        json(res, 200, { ok: true });
      } catch (err) {
        json(res, 500, { error: err.message });
      }
      return;
    }

    // GET: list_assets
    if (req.method === 'GET' && action === 'list_assets') {
      handleListAssets(res);
      return;
    }

    // POST: upload
    if (req.method === 'POST' && action === 'upload') {
      await handleUpload(req, res);
      return;
    }

    // POST: delete_asset
    if (req.method === 'POST' && action === 'delete_asset') {
      await handleDeleteAsset(req, res);
      return;
    }

    // POST: submit_form (Registration, Contact form, Chatbot lead)
    if (req.method === 'POST' && action === 'submit_form') {
      try {
        const bodyStr = (await readBody(req)).toString('utf8');
        const entry = JSON.parse(bodyStr || '{}');

        // Anti-spam honeypot check
        if (entry._hp || entry.website_hp) {
          return json(res, 200, { success: true, message: 'Submission logged.' });
        }

        const subFile = path.join(ROOT, 'data', 'submissions.json');
        let existing = [];
        if (fs.existsSync(subFile)) {
          try {
            const raw = fs.readFileSync(subFile, 'utf8');
            existing = JSON.parse(raw);
            if (!Array.isArray(existing)) {
              existing = existing ? [existing] : [];
            }
          } catch {
            existing = [];
          }
        }

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

        // Guarantee system fields take precedence
        cleanEntry.id = subId;
        cleanEntry.submitted_at = new Date().toISOString();
        cleanEntry.is_read = false;
        cleanEntry.name = nameVal || cleanEntry.name || 'Anonymous';
        cleanEntry.email = emailVal || cleanEntry.email || '';
        cleanEntry.phone = phoneVal || cleanEntry.phone || '';
        delete cleanEntry._hp;
        delete cleanEntry.website_hp;

        existing.unshift(cleanEntry);
        if (existing.length > 1000) {
          existing = existing.slice(0, 1000);
        }

        fs.writeFileSync(subFile, JSON.stringify(existing, null, 2), 'utf8');
        console.log(`[Submission] Logged new ${cleanEntry.type} submission (${subId}) from "${cleanEntry.name}"`);

        return json(res, 200, {
          success: true,
          id: subId,
          message: 'Submission received successfully!'
        });
      } catch (err) {
        console.error('submit_form error:', err);
        return json(res, 500, { success: false, error: err.message });
      }
    }

    // GET: get_submissions
    if (req.method === 'GET' && action === 'get_submissions') {
      try {
        const subFile = path.join(ROOT, 'data', 'submissions.json');
        let subs = [];
        if (fs.existsSync(subFile)) {
          try {
            const raw = fs.readFileSync(subFile, 'utf8');
            subs = JSON.parse(raw);
            if (!Array.isArray(subs)) {
              subs = subs ? [subs] : [];
            }
          } catch {
            subs = [];
          }
        }
        const unreadCount = subs.filter(s => !s.is_read).length;
        return json(res, 200, {
          success: true,
          submissions: subs,
          unreadCount,
          totalCount: subs.length
        });
      } catch (err) {
        return json(res, 500, { success: false, error: err.message });
      }
    }

    // POST: mark_read
    if (req.method === 'POST' && action === 'mark_read') {
      try {
        const bodyStr = (await readBody(req)).toString('utf8');
        const { id } = JSON.parse(bodyStr || '{}');
        const subFile = path.join(ROOT, 'data', 'submissions.json');
        if (fs.existsSync(subFile)) {
          let subs = JSON.parse(fs.readFileSync(subFile, 'utf8') || '[]');
          if (!Array.isArray(subs)) subs = subs ? [subs] : [];
          subs.forEach(s => {
            if (!id || s.id === id) {
              s.is_read = true;
            }
          });
          fs.writeFileSync(subFile, JSON.stringify(subs, null, 2), 'utf8');
        }
        return json(res, 200, { success: true });
      } catch (err) {
        return json(res, 500, { success: false, error: err.message });
      }
    }

    // POST: delete_submission
    if (req.method === 'POST' && action === 'delete_submission') {
      try {
        const bodyStr = (await readBody(req)).toString('utf8');
        const { id } = JSON.parse(bodyStr || '{}');
        const subFile = path.join(ROOT, 'data', 'submissions.json');
        if (fs.existsSync(subFile) && id) {
          let subs = JSON.parse(fs.readFileSync(subFile, 'utf8') || '[]');
          if (Array.isArray(subs)) {
            subs = subs.filter(s => s.id !== id);
            fs.writeFileSync(subFile, JSON.stringify(subs, null, 2), 'utf8');
          }
        }
        return json(res, 200, { success: true });
      } catch (err) {
        return json(res, 500, { success: false, error: err.message });
      }
    }

    // POST or GET: clear_submissions
    if (action === 'clear_submissions') {
      try {
        const subFile = path.join(ROOT, 'data', 'submissions.json');
        fs.writeFileSync(subFile, '[]', 'utf8');
        return json(res, 200, { success: true, message: 'All submissions cleared.' });
      } catch (err) {
        return json(res, 500, { success: false, error: err.message });
      }
    }

    // GET: export_submissions_csv
    if (req.method === 'GET' && action === 'export_submissions_csv') {
      try {
        const subFile = path.join(ROOT, 'data', 'submissions.json');
        let subs = [];
        if (fs.existsSync(subFile)) {
          subs = JSON.parse(fs.readFileSync(subFile, 'utf8') || '[]');
          if (!Array.isArray(subs)) subs = subs ? [subs] : [];
        }

        const escapeCsv = (val) => {
          if (val === null || val === undefined) return '""';
          const str = String(val).replace(/"/g, '""');
          return `"${str}"`;
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
        res.writeHead(200, {
          ...cors,
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="submissions_' + new Date().toISOString().replace(/[:.]/g, '-') + '.csv"'
        });
        res.end(csvContent);
        return;
      } catch (err) {
        return json(res, 500, { success: false, error: err.message });
      }
    }

    // GET: get_addons
    if (req.method === 'GET' && action === 'get_addons') {
      try {
        const addonsFile = path.join(ROOT, 'data', 'addons.json');
        let addons = [];
        if (fs.existsSync(addonsFile)) {
          addons = JSON.parse(fs.readFileSync(addonsFile, 'utf8') || '[]');
          if (!Array.isArray(addons)) addons = [];
        }
        return json(res, 200, { success: true, addons });
      } catch (err) {
        return json(res, 500, { success: false, error: err.message });
      }
    }

    // POST: save_addons
    if (req.method === 'POST' && action === 'save_addons') {
      try {
        const bodyStr = (await readBody(req)).toString('utf8');
        const payload = JSON.parse(bodyStr || '[]');
        const addonsFile = path.join(ROOT, 'data', 'addons.json');
        fs.writeFileSync(addonsFile, JSON.stringify(Array.isArray(payload) ? payload : [], null, 2), 'utf8');
        return json(res, 200, { success: true, message: 'Add-ons saved successfully' });
      } catch (err) {
        return json(res, 500, { success: false, error: err.message });
      }
    }

    json(res, 400, { error: 'unknown action: ' + action });
    return;
  }

  // Static file serving
  let filePath = path.join(ROOT, pathname === '/' ? 'index.html' : pathname);
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403, cors);
    res.end('Forbidden');
    return;
  }

  try {
    if (fs.statSync(filePath).isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }
  } catch {}

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { ...cors, 'Content-Type': 'text/plain' });
      res.end('404: ' + pathname);
      return;
    }
    const ext = path.extname(filePath).slice(1).toLowerCase();
    res.writeHead(200, { ...cors, 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });

}).listen(PORT, () => {
  console.log('AetherBuilder running at http://localhost:' + PORT);
  console.log('Admin  -> http://localhost:' + PORT + '/index.html?view=admin');
  console.log('Public -> http://localhost:' + PORT + '/index.html?view=public');
  console.log('Media  -> ' + UPLOADS_DIR + ' (' + fs.readdirSync(UPLOADS_DIR).length + ' files)');
});
