const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const rootDir = 'C:\\Users\\U S E R - P C\\.gemini\\antigravity-ide\\scratch\\elementor-builder';
const vJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'version.json'), 'utf8'));
const ver = vJson.version || '2.5.1';

const stageDir = path.join(rootDir, 'update_stage');
if (fs.existsSync(stageDir)) fs.rmSync(stageDir, { recursive: true, force: true });
fs.mkdirSync(stageDir, { recursive: true });

function copyRecursive(src, dest) {
  if (fs.statSync(src).isDirectory()) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    for (const item of fs.readdirSync(src)) {
      copyRecursive(path.join(src, item), path.join(dest, item));
    }
  } else {
    fs.copyFileSync(src, dest);
  }
}

// Copy core files (including .htaccess for HTTPS redirect)
['index.html', 'admin.html', 'public.html', 'api.php', 'version.json', 'favicon.png', 'favicon.ico', 'sw.js', '.htaccess'].forEach(f => {
  const p = path.join(rootDir, f);
  if (fs.existsSync(p)) fs.copyFileSync(p, path.join(stageDir, f));
});

// Copy js and css
['js', 'css'].forEach(d => {
  const p = path.join(rootDir, d);
  if (fs.existsSync(p)) copyRecursive(p, path.join(stageDir, d));
});

// Include updated data/addons.json in update package
const stageData = path.join(stageDir, 'data');
fs.mkdirSync(stageData, { recursive: true });
if (fs.existsSync(path.join(rootDir, 'data', 'addons.json'))) {
  fs.copyFileSync(path.join(rootDir, 'data', 'addons.json'), path.join(stageData, 'addons.json'));
}

// Include system branding assets (logo)
const stageAssets = path.join(stageDir, 'assets');
fs.mkdirSync(stageAssets, { recursive: true });
if (fs.existsSync(path.join(rootDir, 'assets', 'logo.png'))) {
  fs.copyFileSync(path.join(rootDir, 'assets', 'logo.png'), path.join(stageAssets, 'logo.png'));
}

const outZipVersioned = path.join(rootDir, `aetherbuilder-update-v${ver}.zip`);
const outZipGeneric = path.join(rootDir, 'aetherbuilder-update.zip');
const outZipLegacy = path.join(rootDir, 'aetherbuilder-update-v2.5.0.zip');

[outZipVersioned, outZipGeneric, outZipLegacy].forEach(z => {
  if (fs.existsSync(z)) fs.unlinkSync(z);
});

// Use Windows tar.exe to create standard POSIX forward-slash (/) ZIP archives
// Compatible across all Linux / Apache / PHP ZipArchive environments!
const items = fs.readdirSync(stageDir);
execSync(`tar -a -c -f "${outZipVersioned}" -C "${stageDir}" ${items.join(' ')}`, { stdio: 'inherit' });
fs.copyFileSync(outZipVersioned, outZipGeneric);
fs.copyFileSync(outZipVersioned, outZipLegacy);

fs.rmSync(stageDir, { recursive: true, force: true });

const stat = fs.statSync(outZipVersioned);
console.log(`Update ZIP created (v${ver}): ` + (stat.size / 1024).toFixed(1) + ' KB (POSIX forward-slash ZIP)');
