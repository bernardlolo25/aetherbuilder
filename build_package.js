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

// Stage files into a clean folder for zipping
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

// Core files
['index.html', 'api.php', 'version.json', 'favicon.png', 'favicon.ico'].forEach(f => {
  const p = path.join(rootDir, f);
  if (fs.existsSync(p)) fs.copyFileSync(p, path.join(stageDir, f));
});

// Core directories
['js', 'css', 'assets'].forEach(d => {
  const p = path.join(rootDir, d);
  if (fs.existsSync(p)) copyRecursive(p, path.join(stageDir, d));
});

// Ensure data folder has default skeleton if needed, without wiping user data
const stageData = path.join(stageDir, 'data');
fs.mkdirSync(stageData, { recursive: true });
if (fs.existsSync(path.join(rootDir, 'data', 'site.json'))) {
  fs.copyFileSync(path.join(rootDir, 'data', 'site.json'), path.join(stageData, 'site.json'));
}
if (fs.existsSync(path.join(rootDir, 'data', 'addons.json'))) {
  fs.copyFileSync(path.join(rootDir, 'data', 'addons.json'), path.join(stageData, 'addons.json'));
}

console.log('Staged files successfully. Creating standard POSIX ZIP archive...');

// Use Windows tar.exe to create standard forward-slash (/) ZIP archive
execSync(`tar -a -c -f "${outZip}" -C "${stageDir}" .`, { stdio: 'inherit' });

// Cleanup stageDir
fs.rmSync(stageDir, { recursive: true, force: true });

fs.copyFileSync(outZip, legacyZip);

const stat = fs.statSync(outZip);
console.log(`Successfully created ${zipName} and ${path.basename(legacyZip)}! Size: ${(stat.size / 1024 / 1024).toFixed(2)} MB`);
