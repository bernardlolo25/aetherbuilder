import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = __dirname;

const vJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'version.json'), 'utf8'));
const ver = vJson.version || '2.9.0';

const stageDir = path.join(rootDir, 'update_stage');
if (fs.existsSync(stageDir)) fs.rmSync(stageDir, { recursive: true, force: true });
fs.mkdirSync(stageDir, { recursive: true });

function copyRecursive(src, dest) {
  if (!fs.existsSync(src)) return;
  if (fs.statSync(src).isDirectory()) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    for (const item of fs.readdirSync(src)) {
      copyRecursive(path.join(src, item), path.join(dest, item));
    }
  } else {
    fs.copyFileSync(src, dest);
  }
}

// 1. Core root files only
const coreRootFiles = [
  'index.html',
  'index.php',
  'admin.html',
  'public.html',
  'api.php',
  'server.js',
  'version.json',
  'favicon.png',
  'favicon.ico',
  'sw.js',
  '.htaccess'
];

coreRootFiles.forEach(f => {
  const p = path.join(rootDir, f);
  if (fs.existsSync(p)) fs.copyFileSync(p, path.join(stageDir, f));
});

// 2. Core js and css modules
['js', 'css'].forEach(d => {
  const p = path.join(rootDir, d);
  if (fs.existsSync(p)) copyRecursive(p, path.join(stageDir, d));
});

// 3. Core data definitions (addons catalog and htaccess only)
const stageData = path.join(stageDir, 'data');
fs.mkdirSync(stageData, { recursive: true });
if (fs.existsSync(path.join(rootDir, 'data', 'addons.json'))) {
  fs.copyFileSync(path.join(rootDir, 'data', 'addons.json'), path.join(stageData, 'addons.json'));
}
if (fs.existsSync(path.join(rootDir, 'data', '.htaccess'))) {
  fs.copyFileSync(path.join(rootDir, 'data', '.htaccess'), path.join(stageData, '.htaccess'));
}

// 4. Branding assets
const stageAssets = path.join(stageDir, 'assets');
fs.mkdirSync(stageAssets, { recursive: true });
if (fs.existsSync(path.join(rootDir, 'assets', 'logo.png'))) {
  fs.copyFileSync(path.join(rootDir, 'assets', 'logo.png'), path.join(stageAssets, 'logo.png'));
}

const outZipVersioned = path.join(rootDir, `aetherbuilder-update-v${ver}.zip`);
const outZipGeneric = path.join(rootDir, 'aetherbuilder-update.zip');

[outZipVersioned, outZipGeneric].forEach(z => {
  if (fs.existsSync(z)) fs.unlinkSync(z);
});

execSync(`python -c "
import zipfile, os
stage = '''${stageDir}'''
out_zip = '''${outZipVersioned}'''
with zipfile.ZipFile(out_zip, 'w', zipfile.ZIP_DEFLATED) as z:
    for root, dirs, files in os.walk(stage):
        for file in files:
            full = os.path.join(root, file)
            rel = os.path.relpath(full, stage).replace('\\\\\\\\', '/')
            z.write(full, rel)
"`);

fs.copyFileSync(outZipVersioned, outZipGeneric);

const publicAssetsDir = path.join(rootDir, 'public', 'assets', 'aistudio');
if (!fs.existsSync(publicAssetsDir)) fs.mkdirSync(publicAssetsDir, { recursive: true });
fs.copyFileSync(outZipGeneric, path.join(publicAssetsDir, 'aetherbuilder-update.zip'));
fs.copyFileSync(outZipVersioned, path.join(publicAssetsDir, `aetherbuilder-v${ver}-fixed-update.zip`));

fs.rmSync(stageDir, { recursive: true, force: true });

const stat = fs.statSync(outZipGeneric);
console.log(`Core Update ZIP created (v${ver}): ${(stat.size / 1024).toFixed(1)} KB (strictly core files only)`);
