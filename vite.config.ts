
import { defineConfig, Plugin } from 'vite';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Dev server middleware to handle api.php endpoints locally
function apiPhpPlugin(): Plugin {
  return {
    name: 'api-php-handler',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url || (!req.url.startsWith('/api.php') && !req.url.includes('api.php?'))) {
          return next();
        }

        const urlObj = new URL(req.url, 'http://localhost');
        const action = urlObj.searchParams.get('action');

        let body = '';
        req.on('data', chunk => {
          body += chunk;
        });

        req.on('end', () => {
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Password, X-Admin-Token, Authorization');

          if (req.method === 'OPTIONS') {
            res.statusCode = 200;
            res.end();
            return;
          }

          const dataDir = resolve(__dirname, 'data');
          if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
          }

          try {
            if (action === 'get_site') {
              const sitePath = path.join(dataDir, 'site.json');
              if (fs.existsSync(sitePath)) {
                const content = fs.readFileSync(sitePath, 'utf8');
                res.statusCode = 200;
                res.end(content);
                return;
              }
              const templatePath = path.join(resolve(__dirname, 'assets/uploads'), 'template_live_canvas.json');
              if (fs.existsSync(templatePath)) {
                const content = fs.readFileSync(templatePath, 'utf8');
                res.statusCode = 200;
                res.end(content);
                return;
              }
              res.statusCode = 200;
              res.end(JSON.stringify({ success: true, site: null }));
              return;
            }

            if (action === 'publish' && req.method === 'POST') {
              const sitePath = path.join(dataDir, 'site.json');
              fs.writeFileSync(sitePath, body, 'utf8');

              // Automatically save canvas template to media uploads
              const uploadsDir = resolve(__dirname, 'assets/uploads');
              if (!fs.existsSync(uploadsDir)) {
                fs.mkdirSync(uploadsDir, { recursive: true });
              }
              fs.writeFileSync(path.join(uploadsDir, 'template_live_canvas.json'), body, 'utf8');
              fs.writeFileSync(path.join(uploadsDir, `template_live_${Date.now()}.json`), body, 'utf8');

              // Archive revision snapshot to revisions.json
              const revPath = path.join(dataDir, 'revisions.json');
              let revs: any[] = [];
              if (fs.existsSync(revPath)) {
                try { revs = JSON.parse(fs.readFileSync(revPath, 'utf8')); } catch {}
              }
              let decoded: any = {};
              try { decoded = JSON.parse(body); } catch {}
              const now = new Date();
              const formattedDate = now.toLocaleDateString('en-US', {
                month: 'short', day: 'numeric', year: 'numeric',
                hour: 'numeric', minute: '2-digit', hour12: true
              });
              const pageCount = Array.isArray(decoded.pages) ? decoded.pages.length : 1;
              const totalSections = Array.isArray(decoded.pages)
                ? decoded.pages.reduce((acc: number, p: any) => acc + (p.sections?.length || 0), 0)
                : (decoded.sections?.length || 0);

              const newRev = {
                id: `rev_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
                saved_at: now.toISOString(),
                formattedDate: formattedDate,
                siteName: decoded.siteSettings?.siteTitle || 'USPF MCLE Site',
                pageCount: pageCount,
                totalSections: totalSections,
                sizeBytes: Buffer.byteLength(body, 'utf8'),
                snapshot: decoded
              };
              revs.unshift(newRev);
              if (revs.length > 50) revs = revs.slice(0, 50);
              fs.writeFileSync(revPath, JSON.stringify(revs, null, 2), 'utf8');

              res.statusCode = 200;
              res.end(JSON.stringify({
                success: true,
                message: 'Published successfully, revision archived, and canvas template saved to media',
                published_at: now.toISOString(),
                revisionId: newRev.id,
                template: 'assets/uploads/template_live_canvas.json'
              }));
              return;
            }

            if (action === 'get_addons') {
              const addonsPath = path.join(dataDir, 'addons.json');
              if (fs.existsSync(addonsPath)) {
                try {
                  const parsed = JSON.parse(fs.readFileSync(addonsPath, 'utf8'));
                  res.statusCode = 200;
                  res.end(JSON.stringify({ success: true, addons: parsed }));
                  return;
                } catch {}
              }
              res.statusCode = 200;
              res.end(JSON.stringify({ success: true, addons: [] }));
              return;
            }

            if (action === 'save_addons' && req.method === 'POST') {
              const addonsPath = path.join(dataDir, 'addons.json');
              fs.writeFileSync(addonsPath, body, 'utf8');
              res.statusCode = 200;
              res.end(JSON.stringify({ success: true }));
              return;
            }

            if (action === 'list_assets') {
              const uploadsDir = resolve(__dirname, 'assets/uploads');
              const assetsDir = resolve(__dirname, 'assets');
              let assetsList: any[] = [];

              if (fs.existsSync(uploadsDir)) {
                const files = fs.readdirSync(uploadsDir);
                for (const file of files) {
                  const fullPath = path.join(uploadsDir, file);
                  const stat = fs.statSync(fullPath);
                  if (stat.isFile()) {
                    assetsList.push({
                      name: file,
                      url: `assets/uploads/${file}`,
                      ext: path.extname(file).replace('.', '').toLowerCase(),
                      size: stat.size,
                      modified: stat.mtimeMs
                    });
                  }
                }
              }

              if (fs.existsSync(assetsDir)) {
                const files = fs.readdirSync(assetsDir);
                for (const file of files) {
                  if (file === 'uploads') continue;
                  const fullPath = path.join(assetsDir, file);
                  const stat = fs.statSync(fullPath);
                  if (stat.isFile()) {
                    assetsList.push({
                      name: file,
                      url: `assets/${file}`,
                      ext: path.extname(file).replace('.', '').toLowerCase(),
                      size: stat.size,
                      modified: stat.mtimeMs
                    });
                  }
                }
              }

              // Sort newest first
              assetsList.sort((a, b) => (b.modified || 0) - (a.modified || 0));

              res.statusCode = 200;
              res.end(JSON.stringify({ success: true, assets: assetsList }));
              return;
            }

            if (action === 'upload' && req.method === 'POST') {
              const uploadsDir = resolve(__dirname, 'assets/uploads');
              if (!fs.existsSync(uploadsDir)) {
                fs.mkdirSync(uploadsDir, { recursive: true });
              }

              const contentType = req.headers['content-type'] || '';
              let filename = `upload_${Date.now()}.json`;
              let fileData = body;

              if (contentType.includes('boundary=')) {
                const boundary = contentType.split('boundary=')[1].trim();
                const parts = body.split(`--${boundary}`);
                for (const part of parts) {
                  if (part.includes('filename=')) {
                    const match = part.match(/filename="([^"]+)"/);
                    if (match && match[1]) {
                      filename = match[1];
                    }
                    const headerEnd = part.indexOf('\r\n\r\n');
                    if (headerEnd !== -1) {
                      fileData = part.substring(headerEnd + 4).replace(/\r\n$/, '');
                    }
                    break;
                  }
                }
              }

              const safeName = filename.replace(/[^a-zA-Z0-9_\-\.]/g, '_');
              const destPath = path.join(uploadsDir, safeName);
              fs.writeFileSync(destPath, fileData, typeof fileData === 'string' ? 'utf8' : undefined);

              res.statusCode = 200;
              res.end(JSON.stringify({
                success: true,
                name: safeName,
                url: `assets/uploads/${safeName}`,
                ext: path.extname(safeName).replace('.', '').toLowerCase()
              }));
              return;
            }

            if (action === 'delete_asset' && req.method === 'POST') {
              try {
                const data = JSON.parse(body);
                const assetName = path.basename(data.name || '');
                const filePath = path.join(resolve(__dirname, 'assets/uploads'), assetName);
                if (fs.existsSync(filePath)) {
                  fs.unlinkSync(filePath);
                }
              } catch {}
              res.statusCode = 200;
              res.end(JSON.stringify({ success: true }));
              return;
            }

            if (action === 'get_system_info') {
              res.statusCode = 200;
              res.end(JSON.stringify({
                version: '2.7.0',
                php_version: '7.4+ (Compatible API)',
                platform: 'AetherBuilder Environment',
                status: 'operational'
              }));
              return;
            }

            if (action === 'get_dev_auth') {
              const devPath = path.join(dataDir, 'dev_auth.json');
              let data: any = { argon2_hash: '' };
              if (fs.existsSync(devPath)) {
                try { data = JSON.parse(fs.readFileSync(devPath, 'utf8')); } catch {}
              }
              res.statusCode = 200;
              res.end(JSON.stringify({ success: true, has_hash: !!data.argon2_hash, argon2_hash: data.argon2_hash || '' }));
              return;
            }

            if (action === 'verify_dev_session' && req.method === 'POST') {
              res.statusCode = 200;
              res.end(JSON.stringify({ success: true, token: 'dev_mock_token_' + Date.now() }));
              return;
            }

            if (action === 'save_dev_auth' && req.method === 'POST') {
              const devPath = path.join(dataDir, 'dev_auth.json');
              let existing: any = {};
              if (fs.existsSync(devPath)) {
                try { existing = JSON.parse(fs.readFileSync(devPath, 'utf8')); } catch {}
              }
              let decoded: any = {};
              try { decoded = JSON.parse(body); } catch {}
              existing.argon2_hash = decoded.argon2_hash || existing.argon2_hash;
              existing.updated_at = new Date().toISOString();
              fs.writeFileSync(devPath, JSON.stringify(existing, null, 2), 'utf8');
              res.statusCode = 200;
              res.end(JSON.stringify({ success: true }));
              return;
            }

            if (action === 'get_templates') {
              const tmplPath = path.join(dataDir, 'templates.json');
              if (fs.existsSync(tmplPath)) {
                const content = fs.readFileSync(tmplPath, 'utf8');
                res.statusCode = 200;
                res.end(content);
                return;
              }
              res.statusCode = 200;
              res.end(JSON.stringify([]));
              return;
            }

            if (action === 'save_templates' && req.method === 'POST') {
              const tmplPath = path.join(dataDir, 'templates.json');
              fs.writeFileSync(tmplPath, body, 'utf8');
              res.statusCode = 200;
              res.end(JSON.stringify({ success: true }));
              return;
            }

            if (action === 'get_store_feed_config') {
              const feedPath = path.join(dataDir, 'store_feed.json');
              if (fs.existsSync(feedPath)) {
                const content = fs.readFileSync(feedPath, 'utf8');
                res.statusCode = 200;
                res.end(JSON.stringify({ success: true, config: JSON.parse(content) }));
                return;
              }
              res.statusCode = 200;
              res.end(JSON.stringify({ success: true, config: { remoteFeedUrl: 'https://raw.githubusercontent.com/aetherbuilder/addons-repo/main/addons.json' } }));
              return;
            }

            if (action === 'save_store_feed_config' && req.method === 'POST') {
              const feedPath = path.join(dataDir, 'store_feed.json');
              let existing: any = {};
              if (fs.existsSync(feedPath)) {
                try { existing = JSON.parse(fs.readFileSync(feedPath, 'utf8')); } catch {}
              }
              let decoded: any = {};
              try { decoded = JSON.parse(body); } catch {}
              const updated = { ...existing, ...decoded };
              fs.writeFileSync(feedPath, JSON.stringify(updated, null, 2), 'utf8');
              res.statusCode = 200;
              res.end(JSON.stringify({ success: true, config: updated }));
              return;
            }

            if (action === 'verify_session' || action === 'login' || action === 'validate_token') {
              res.statusCode = 200;
              res.end(JSON.stringify({ success: true, valid: true }));
              return;
            }

            if (action === 'get_submissions') {
              const subPath = path.join(dataDir, 'submissions.json');
              let subs: any[] = [];
              if (fs.existsSync(subPath)) {
                try {
                  subs = JSON.parse(fs.readFileSync(subPath, 'utf8'));
                } catch {}
              }
              res.statusCode = 200;
              res.end(JSON.stringify({ success: true, submissions: subs }));
              return;
            }

            if (action === 'submit_form' && req.method === 'POST') {
              const subPath = path.join(dataDir, 'submissions.json');
              let subs: any[] = [];
              if (fs.existsSync(subPath)) {
                try {
                  subs = JSON.parse(fs.readFileSync(subPath, 'utf8'));
                } catch {}
              }
              try {
                subs.push({ ...JSON.parse(body), timestamp: new Date().toISOString(), id: Date.now() });
                fs.writeFileSync(subPath, JSON.stringify(subs, null, 2), 'utf8');
              } catch {}
              res.statusCode = 200;
              res.end(JSON.stringify({ success: true, message: 'Form submitted' }));
              return;
            }

            if (action === 'get_revisions') {
              const revPath = path.join(dataDir, 'revisions.json');
              let revs: any[] = [];
              if (fs.existsSync(revPath)) {
                try { revs = JSON.parse(fs.readFileSync(revPath, 'utf8')); } catch {}
              }
              // If no revisions saved yet, synthesize initial recovery snapshot from site.json
              if (revs.length === 0) {
                const sitePath = path.join(dataDir, 'site.json');
                if (fs.existsSync(sitePath)) {
                  try {
                    const siteContent = fs.readFileSync(sitePath, 'utf8');
                    const decoded = JSON.parse(siteContent);
                    const now = new Date();
                    const initialRev = {
                      id: `rev_${Date.now()}_init`,
                      saved_at: decoded.publishedAt || now.toISOString(),
                      formattedDate: new Date(decoded.publishedAt || now).toLocaleDateString('en-US', {
                        month: 'short', day: 'numeric', year: 'numeric',
                        hour: 'numeric', minute: '2-digit', hour12: true
                      }),
                      siteName: decoded.siteSettings?.siteTitle || 'USPF MCLE Site',
                      pageCount: Array.isArray(decoded.pages) ? decoded.pages.length : 1,
                      totalSections: Array.isArray(decoded.pages)
                        ? decoded.pages.reduce((acc: number, p: any) => acc + (p.sections?.length || 0), 0)
                        : (decoded.sections?.length || 0),
                      sizeBytes: Buffer.byteLength(siteContent, 'utf8'),
                      snapshot: decoded
                    };
                    revs = [initialRev];
                    fs.writeFileSync(revPath, JSON.stringify(revs, null, 2), 'utf8');
                  } catch {}
                }
              }
              res.statusCode = 200;
              res.end(JSON.stringify({ success: true, revisions: revs }));
              return;
            }

            if (action === 'rollback_revision' && req.method === 'POST') {
              let data: any = {};
              try { data = JSON.parse(body); } catch {}
              const revId = data.revisionId || data.id;
              if (!revId) {
                res.statusCode = 400;
                res.end(JSON.stringify({ success: false, error: 'No revision ID specified' }));
                return;
              }
              const revPath = path.join(dataDir, 'revisions.json');
              let revs: any[] = [];
              if (fs.existsSync(revPath)) {
                try { revs = JSON.parse(fs.readFileSync(revPath, 'utf8')); } catch {}
              }
              const target = revs.find(r => r.id === revId);
              if (!target || !target.snapshot) {
                res.statusCode = 404;
                res.end(JSON.stringify({ success: false, error: 'Revision snapshot not found' }));
                return;
              }
              const sitePath = path.join(dataDir, 'site.json');
              fs.writeFileSync(sitePath, JSON.stringify(target.snapshot, null, 2), 'utf8');
              const uploadsDir = resolve(__dirname, 'assets/uploads');
              fs.writeFileSync(path.join(uploadsDir, 'template_live_canvas.json'), JSON.stringify(target.snapshot, null, 2), 'utf8');
              res.statusCode = 200;
              res.end(JSON.stringify({ success: true, message: `Rolled back to revision ${revId}`, revisionId: revId }));
              return;
            }

            // Developer Argon2 & Feed Endpoints
            if (action === 'get_dev_auth') {
              const devAuthPath = path.join(dataDir, 'dev_auth.json');
              if (fs.existsSync(devAuthPath)) {
                try {
                  const data = JSON.parse(fs.readFileSync(devAuthPath, 'utf8'));
                  res.statusCode = 200;
                  res.end(JSON.stringify({ success: true, argon2_hash: data.argon2_hash || '' }));
                  return;
                } catch {}
              }
              res.statusCode = 200;
              res.end(JSON.stringify({ success: true, argon2_hash: '' }));
              return;
            }

            if (action === 'save_dev_auth' && req.method === 'POST') {
              const devAuthPath = path.join(dataDir, 'dev_auth.json');
              let parsed: any = {};
              try { parsed = JSON.parse(body); } catch {}
              const toSave = {
                argon2_hash: parsed.argon2_hash || '',
                updated_at: new Date().toISOString()
              };
              fs.writeFileSync(devAuthPath, JSON.stringify(toSave, null, 2), 'utf8');
              res.statusCode = 200;
              res.end(JSON.stringify({ success: true, message: 'Developer credentials saved' }));
              return;
            }

            if (action === 'verify_dev_session' && req.method === 'POST') {
              const token = `dev_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
              res.statusCode = 200;
              res.end(JSON.stringify({ success: true, token }));
              return;
            }

            if (action === 'get_templates') {
              const tmplPath = path.join(dataDir, 'templates.json');
              if (fs.existsSync(tmplPath)) {
                try {
                  const tmpls = JSON.parse(fs.readFileSync(tmplPath, 'utf8'));
                  res.statusCode = 200;
                  res.end(JSON.stringify(tmpls));
                  return;
                } catch {}
              }
              res.statusCode = 200;
              res.end(JSON.stringify([]));
              return;
            }

            if (action === 'save_templates' && req.method === 'POST') {
              const tmplPath = path.join(dataDir, 'templates.json');
              let tmpls: any = [];
              try { tmpls = JSON.parse(body); } catch {}
              fs.writeFileSync(tmplPath, JSON.stringify(tmpls, null, 2), 'utf8');
              res.statusCode = 200;
              res.end(JSON.stringify({ success: true, message: 'Templates saved' }));
              return;
            }

            if (action === 'get_store_feed_config') {
              const feedPath = path.join(dataDir, 'store_feed.json');
              if (fs.existsSync(feedPath)) {
                try {
                  const feed = JSON.parse(fs.readFileSync(feedPath, 'utf8'));
                  res.statusCode = 200;
                  res.end(JSON.stringify(feed));
                  return;
                } catch {}
              }
              res.statusCode = 200;
              res.end(JSON.stringify({ remoteFeedUrl: '', gcash: {}, stripeCheckoutUrl: '', masterUnlockKey: 'AETHER-PRO-UNLOCK' }));
              return;
            }

            if (action === 'save_store_feed_config' && req.method === 'POST') {
              const feedPath = path.join(dataDir, 'store_feed.json');
              let feedConfig: any = {};
              try { feedConfig = JSON.parse(body); } catch {}
              fs.writeFileSync(feedPath, JSON.stringify(feedConfig, null, 2), 'utf8');
              res.statusCode = 200;
              res.end(JSON.stringify({ success: true, message: 'Feed configuration saved' }));
              return;
            }

            // Default fallback response
            res.statusCode = 200;
            res.end(JSON.stringify({ success: true, action }));
          } catch (err: any) {
            res.statusCode = 500;
            res.end(JSON.stringify({ success: false, error: err.message }));
          }
        });
      });
    }
  };
}

export default defineConfig({
  plugins: [apiPhpPlugin()],
  base: './',
  define: {
    'process.env': process.env
  },
  server: {
    port: 3000,
    host: '0.0.0.0',
    // HMR is disabled in AI Studio via DISABLE_HMR env var.
    hmr: process.env.DISABLE_HMR !== 'true',
    watch: process.env.DISABLE_HMR === 'true' ? null : {},
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        admin: resolve(__dirname, 'admin.html'),
        public: resolve(__dirname, 'public.html'),
      },
    },
  },
});

