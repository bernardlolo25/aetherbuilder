const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const rootDir = 'C:\\Users\\U S E R - P C\\.gemini\\antigravity-ide\\scratch\\elementor-builder';
const zipName = 'aetherbuilder.zip';
const outZip = path.join(rootDir, zipName);
const legacyZip = path.join(rootDir, 'elementor-builder4.zip');

[outZip, legacyZip].forEach(z => {
  if (fs.existsSync(z)) fs.unlinkSync(z);
});

// Clean stage directory
const stageDir = path.join(rootDir, 'dist_package');
if (fs.existsSync(stageDir)) {
  fs.rmSync(stageDir, { recursive: true, force: true });
}
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

// 1. Core root files
console.log('Copying core files...');
['index.html', 'api.php', 'version.json', 'favicon.png', 'favicon.ico', '.htaccess'].forEach(f => {
  const p = path.join(rootDir, f);
  if (fs.existsSync(p)) {
    fs.copyFileSync(p, path.join(stageDir, f));
  } else {
    console.warn('Warning: Missing file ' + f);
  }
});

// 2. js & css directories
console.log('Copying JS & CSS libraries...');
['js', 'css'].forEach(d => {
  const src = path.join(rootDir, d);
  if (fs.existsSync(src)) copyRecursive(src, path.join(stageDir, d));
});

// 3. assets directory: include logo.png and an EMPTY assets/uploads/ folder
console.log('Setting up assets folder (excluding heavy uploaded media)...');
const stageAssets = path.join(stageDir, 'assets');
fs.mkdirSync(stageAssets, { recursive: true });

if (fs.existsSync(path.join(rootDir, 'assets', 'logo.png'))) {
  fs.copyFileSync(path.join(rootDir, 'assets', 'logo.png'), path.join(stageAssets, 'logo.png'));
}

const stageUploads = path.join(stageAssets, 'uploads');
fs.mkdirSync(stageUploads, { recursive: true });
fs.writeFileSync(path.join(stageUploads, '.gitkeep'), '');

// 4. data directory: addons, site.json, and data/.htaccess
console.log('Setting up data folder (addons, site layout, placeholders)...');
const stageData = path.join(stageDir, 'data');
fs.mkdirSync(stageData, { recursive: true });

['addons.json', 'site.json', '.htaccess'].forEach(f => {
  const p = path.join(rootDir, 'data', f);
  if (fs.existsSync(p)) fs.copyFileSync(p, path.join(stageData, f));
});

['backups', 'revisions'].forEach(sub => {
  const p = path.join(stageData, sub);
  fs.mkdirSync(p, { recursive: true });
  fs.writeFileSync(path.join(p, '.gitkeep'), '');
});

console.log('Staged files successfully. Creating standard POSIX ZIP archive...');

// Create standard ZIP without leading ./
const items = fs.readdirSync(stageDir);
execSync(`tar -a -c -f "${outZip}" -C "${stageDir}" ${items.join(' ')}`, { stdio: 'inherit' });

// Cleanup staging folder
fs.rmSync(stageDir, { recursive: true, force: true });

fs.copyFileSync(outZip, legacyZip);

const stat = fs.statSync(outZip);
console.log(`\n🎉 Successfully packaged AetherBuilder!`);
console.log(`   File: ${zipName}`);
console.log(`   Size: ${(stat.size / 1024 / 1024).toFixed(2)} MB (${Math.round(stat.size / 1024)} KB)`);
