const fs = require('fs');
const appPath = 'C:\\Users\\U S E R - P C\\.gemini\\antigravity-ide\\scratch\\elementor-builder\\js\\app.js';
let code = fs.readFileSync(appPath, 'utf8');

// 1. Export APP_VERSION at top
const versionConst = `export const APP_VERSION = '2.5.0';\n`;
if (!code.includes('export const APP_VERSION')) {
  code = versionConst + code;
  console.log('APP_VERSION added.');
}

// 2. Update brand section in renderAdminStudio
const oldBrand = `            <a href="#" class="topbar-brand">
              <div class="topbar-logo-badge">⚡</div>
              <div>
                <span>AetherBuilder</span>
                <span style="font-size: 0.72rem; color: var(--text-dim); margin-left: 4px; font-weight: 500;">v2.6</span>
              </div>
            </a>`;

const newBrand = `            <div class="topbar-brand" id="topbar-brand-link" style="cursor: pointer;" title="AetherBuilder Studio (Click for System Info & Updates)">
              <div class="topbar-logo-badge">⚡</div>
              <div>
                <span>AetherBuilder</span>
                <span class="app-version-pill" id="app-version-badge" style="font-size: 0.72rem; color: var(--text-dim); margin-left: 4px; font-weight: 500;">v\${APP_VERSION}</span>
              </div>
            </div>

            <!-- WordPress-style Update Available pill -->
            <div id="update-indicator-pill" class="update-available-pill" style="display:none;" title="A newer version is ready! Click to install update.">
              <span>⚡</span>
              <span>Update Ready!</span>
            </div>`;

if (code.includes(oldBrand)) {
  code = code.replace(oldBrand, newBrand);
  console.log('Brand topbar updated.');
} else {
  console.log('Old brand pattern not found, trying regex fallback...');
  code = code.replace(/<a href="#" class="topbar-brand">[\s\S]*?v2\.[0-9]+<\/span>\s*<\/div>\s*<\/a>/, newBrand);
}

// 3. Add btn-system-updates to topbar-actions
const oldNotifications = `            <!-- Notifications & Leads Hub -->
            <button class="tool-icon-btn" id="btn-notifications"`;

const newActionsPrefix = `            <!-- System Updates Center Button -->
            <button class="tool-icon-btn" id="btn-system-updates" title="System Updates & Maintenance" style="position: relative;">
              <span>🔄</span>
              <span id="update-badge-dot" style="display:none; position:absolute; top:-2px; right:-2px; background:#10b981; border-radius:50%; width:8px; height:8px; box-shadow:0 0 6px #10b981;"></span>
            </button>

            <!-- Notifications & Leads Hub -->
            <button class="tool-icon-btn" id="btn-notifications"`;

if (code.includes(oldNotifications) && !code.includes('btn-system-updates')) {
  code = code.replace(oldNotifications, newActionsPrefix);
  console.log('System updates button added to topbar.');
}

// 4. In bindEvents(), add listeners and trigger checkForUpdates()
const oldBindEventsEnd = `    // Logout
    document.getElementById('btn-logout').addEventListener('click', () => {
      if (confirm('Lock Admin Studio and log out?')) {
        auth.logout();
      }
    });
  }`;

const newBindEventsEnd = `    // Logout
    document.getElementById('btn-logout').addEventListener('click', () => {
      if (confirm('Lock Admin Studio and log out?')) {
        auth.logout();
      }
    });

    // System Updates & Maintenance Hub
    document.getElementById('update-indicator-pill')?.addEventListener('click', () => {
      this.showUpdateModal();
    });
    document.getElementById('btn-system-updates')?.addEventListener('click', () => {
      this.showUpdateModal();
    });
    document.getElementById('topbar-brand-link')?.addEventListener('click', (e) => {
      e.preventDefault();
      this.showUpdateModal();
    });

    // Pre-flight version check
    this.checkForUpdates();
  }`;

if (code.includes(oldBindEventsEnd)) {
  code = code.replace(oldBindEventsEnd, newBindEventsEnd);
  console.log('Updater event bindings added.');
}

// 5. Append Updater methods to AetherApp class before final closing brace
const updaterMethods = `
  // --------------------------------------------------------------------------
  // WORDPRESS-STYLE 1-CLICK SYSTEM UPDATER
  // --------------------------------------------------------------------------
  async checkForUpdates() {
    try {
      const ts = Date.now();
      let manifest = null;
      try {
        const res = await fetch(\`version.json?_t=\${ts}\`, { cache: 'no-store' });
        if (res.ok) {
          manifest = await res.json();
        }
      } catch {}

      if (!manifest) return;

      this.latestVersionManifest = manifest;
      const remoteVer = manifest.version || '0.0.0';
      const isNewer = this.compareVersions(remoteVer, APP_VERSION) > 0;

      const pill = document.getElementById('update-indicator-pill');
      const dot = document.getElementById('update-badge-dot');
      const badge = document.getElementById('app-version-badge');

      if (isNewer) {
        if (pill) {
          pill.style.display = 'inline-flex';
          pill.innerHTML = \`<span>⚡</span> <span>v\${remoteVer} Ready!</span>\`;
        }
        if (dot) dot.style.display = 'block';
        if (badge) {
          badge.style.color = '#10b981';
          badge.style.fontWeight = '700';
          badge.title = \`New version v\${remoteVer} available! Click to update.\`;
        }
      }
    } catch (err) {
      console.warn('Update check deferred:', err);
    }
  }

  compareVersions(v1, v2) {
    const parts1 = String(v1).replace(/^v/i, '').split('.').map(n => parseInt(n, 10) || 0);
    const parts2 = String(v2).replace(/^v/i, '').split('.').map(n => parseInt(n, 10) || 0);
    const maxLen = Math.max(parts1.length, parts2.length);
    for (let i = 0; i < maxLen; i++) {
      const p1 = parts1[i] || 0;
      const p2 = parts2[i] || 0;
      if (p1 > p2) return 1;
      if (p1 < p2) return -1;
    }
    return 0;
  }

  async showUpdateModal() {
    let modal = document.getElementById('aether-update-modal');
    if (modal) modal.remove();

    modal = document.createElement('div');
    modal.id = 'aether-update-modal';
    modal.className = 'modal-overlay animate-fade-in';

    modal.innerHTML = \`
      <div class="modal-box modal-wide animate-scale-in" style="max-width: 680px;">
        <div class="modal-header">
          <div class="modal-title flex items-center gap-2">
            <span>⚡</span>
            <span>AetherBuilder Update & System Hub</span>
          </div>
          <button class="tool-icon-btn" id="close-update-modal">✕</button>
        </div>
        <div class="modal-body" style="padding: 20px 24px;">
          <!-- System Status Bar -->
          <div class="update-system-checks" id="update-system-checks">
            <div class="update-check-item">
              <span class="check-label">Installed Version</span>
              <span class="check-value" id="stat-curr-ver">v\${APP_VERSION}</span>
            </div>
            <div class="update-check-item">
              <span class="check-label">Latest Release</span>
              <span class="check-value" id="stat-latest-ver">Checking...</span>
            </div>
            <div class="update-check-item">
              <span class="check-label">PHP Engine</span>
              <span class="check-value" id="stat-php-ver">...</span>
            </div>
            <div class="update-check-item">
              <span class="check-label">ZipArchive</span>
              <span class="check-value" id="stat-zip-status">...</span>
            </div>
          </div>

          <!-- Tabs -->
          <div class="update-modal-tabs">
            <button class="update-modal-tab active" data-tab="auto">⚡ 1-Click Update</button>
            <button class="update-modal-tab" data-tab="manual">📦 Manual ZIP Drop</button>
            <button class="update-modal-tab" data-tab="backups">🕒 Backups & Rollback</button>
          </div>

          <!-- Tab 1: 1-Click Auto Update -->
          <div id="tab-auto-content" class="update-tab-content">
            <div class="update-changelog-card">
              <h4>📋 What's in this Release</h4>
              <ul class="update-changelog-list" id="update-changelog-list">
                <li>Loading release notes...</li>
              </ul>
            </div>

            <div style="background: rgba(16, 185, 129, 0.08); border: 1px solid rgba(16, 185, 129, 0.25); border-radius: 8px; padding: 12px 14px; margin-bottom: 16px; font-size: 0.82rem; color: #a7f3d0; display: flex; align-items: flex-start; gap: 8px;">
              <span>🛡️</span>
              <div>
                <strong>Zero-Risk Data Guarantee:</strong> Updating will overwrite system files only. Your published pages, layout drafts, uploaded media in <code>assets/uploads/</code>, and custom add-ons will <strong>NEVER</strong> be overwritten or deleted.
              </div>
            </div>

            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 18px;">
              <label style="display: flex; align-items: center; gap: 8px; font-size: 0.82rem; color: var(--text-muted); cursor: pointer;">
                <input type="checkbox" id="chk-auto-backup" checked style="accent-color: var(--primary);">
                Create pre-update safety backup in <code>data/backups/</code>
              </label>
            </div>

            <!-- Progress Bar -->
            <div id="update-progress-area" class="update-progress-container" style="display: none;">
              <div class="update-progress-bar-bg">
                <div id="update-progress-fill" class="update-progress-bar-fill"></div>
              </div>
              <div class="update-progress-status">
                <span id="update-status-msg">Initializing update...</span>
                <span id="update-percent-text">0%</span>
              </div>
            </div>

            <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 10px;">
              <button class="topbar-btn" id="btn-cancel-update" style="background: rgba(255,255,255,0.06);">Close</button>
              <button class="topbar-btn topbar-btn-publish" id="btn-start-auto-update" style="padding: 10px 20px; font-size: 0.88rem; font-weight: 700;">
                <span>⚡</span> Install Update Now
              </button>
            </div>
          </div>

          <!-- Tab 2: Manual ZIP Drop -->
          <div id="tab-manual-content" class="update-tab-content" style="display: none;">
            <div style="font-size: 0.82rem; color: var(--text-dim); margin-bottom: 14px; line-height: 1.5;">
              If your web host blocks outgoing internet connections, you can drop any <code>aetherbuilder-update.zip</code> here to update your builder directly in 2 seconds without logging into cPanel or FTP!
            </div>
            
            <div class="update-dropzone" id="update-zip-dropzone">
              <div style="font-size: 2.2rem; margin-bottom: 8px;">📦</div>
              <div style="font-size: 0.9rem; font-weight: 700; color: #f1f5f9; margin-bottom: 4px;">Drag & Drop Update ZIP Here</div>
              <div style="font-size: 0.78rem; color: var(--text-dim); margin-bottom: 12px;">or click to browse your computer</div>
              <input type="file" id="update-zip-file-input" accept=".zip" style="display: none;">
              <button class="topbar-btn topbar-btn-sm" id="btn-select-zip-file" style="margin: 0 auto;">Select ZIP File</button>
            </div>

            <div id="manual-file-selected-info" style="display:none; margin-top: 12px; padding: 10px 14px; background: rgba(255,255,255,0.04); border-radius: 8px; font-size: 0.82rem; justify-content: space-between; align-items: center;">
              <span id="selected-zip-name" style="color: #a5b4fc; font-weight: 600;">package.zip</span>
              <button class="topbar-btn topbar-btn-publish" id="btn-upload-manual-zip" style="padding: 6px 14px; font-size: 0.8rem;">
                <span>🚀</span> Unpack & Install
              </button>
            </div>
          </div>

          <!-- Tab 3: Backups & Rollback -->
          <div id="tab-backups-content" class="update-tab-content" style="display: none;">
            <div style="font-size: 0.82rem; color: var(--text-dim); margin-bottom: 12px;">
              Pre-update archives are preserved in <code>data/backups/</code>.
            </div>
            <div id="backups-list-container" style="display: flex; flex-direction: column; gap: 8px; max-height: 220px; overflow-y: auto;">
              <div style="color: var(--text-dim); font-size: 0.8rem; text-align: center; padding: 20px;">Fetching backups...</div>
            </div>
          </div>

        </div>
      </div>
    \`;

    document.body.appendChild(modal);

    modal.querySelector('#close-update-modal').addEventListener('click', () => modal.remove());
    modal.querySelector('#btn-cancel-update').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

    modal.querySelectorAll('.update-modal-tab').forEach(tabBtn => {
      tabBtn.addEventListener('click', () => {
        modal.querySelectorAll('.update-modal-tab').forEach(b => b.classList.remove('active'));
        tabBtn.classList.add('active');
        const tab = tabBtn.dataset.tab;
        modal.querySelector('#tab-auto-content').style.display = tab === 'auto' ? 'block' : 'none';
        modal.querySelector('#tab-manual-content').style.display = tab === 'manual' ? 'block' : 'none';
        modal.querySelector('#tab-backups-content').style.display = tab === 'backups' ? 'block' : 'none';
        if (tab === 'backups') this.loadBackupsList(modal);
      });
    });

    this.populateUpdateModal(modal);
    this.bindManualZipUpload(modal);
  }

  async populateUpdateModal(modal) {
    try {
      // 1. Fetch system info from api.php
      const sysRes = await fetch('api.php?action=get_system_info');
      if (sysRes.ok) {
        const sys = await sysRes.json();
        const phpEl = modal.querySelector('#stat-php-ver');
        if (phpEl) phpEl.textContent = 'PHP ' + (sys.php_version ? sys.php_version.split('-')[0] : 'OK');
        
        const zipEl = modal.querySelector('#stat-zip-status');
        if (zipEl) {
          if (sys.zip_supported) {
            zipEl.innerHTML = '<span style="color:#10b981;">✓ Enabled</span>';
          } else {
            zipEl.innerHTML = '<span style="color:#ef4444;">✗ Disabled</span>';
          }
        }
      }
    } catch (e) {
      console.warn('System info query skipped:', e);
    }

    // 2. Populate manifest info
    const manifest = this.latestVersionManifest;
    const latestEl = modal.querySelector('#stat-latest-ver');
    const changelogList = modal.querySelector('#update-changelog-list');
    const updateBtn = modal.querySelector('#btn-start-auto-update');

    if (manifest) {
      const remoteVer = manifest.version || APP_VERSION;
      const isNewer = this.compareVersions(remoteVer, APP_VERSION) > 0;
      
      if (latestEl) {
        latestEl.textContent = 'v' + remoteVer;
        if (isNewer) latestEl.className = 'check-value';
      }

      if (changelogList && Array.isArray(manifest.changelog)) {
        changelogList.innerHTML = manifest.changelog.map(item => \`<li>\${item}</li>\`).join('');
      }

      if (updateBtn) {
        if (!isNewer) {
          updateBtn.innerHTML = '<span>🔄</span> Reinstall / Repair Core';
        } else {
          updateBtn.innerHTML = \`<span>⚡</span> Install Update (v\${remoteVer})\`;
        }

        updateBtn.onclick = () => this.executeAutoUpdate(modal, manifest);
      }
    } else {
      if (latestEl) latestEl.textContent = 'v' + APP_VERSION;
      if (changelogList) changelogList.innerHTML = '<li>System is operating normally on current version.</li>';
    }
  }

  async executeAutoUpdate(modal, manifest) {
    const btn = modal.querySelector('#btn-start-auto-update');
    const progressArea = modal.querySelector('#update-progress-area');
    const fill = modal.querySelector('#update-progress-fill');
    const statusMsg = modal.querySelector('#update-status-msg');
    const percentText = modal.querySelector('#update-percent-text');
    const chkBackup = modal.querySelector('#chk-auto-backup');

    if (btn) btn.disabled = true;
    if (progressArea) progressArea.style.display = 'flex';

    const setProgress = (pct, text) => {
      if (fill) fill.style.width = pct + '%';
      if (percentText) percentText.textContent = pct + '%';
      if (statusMsg) statusMsg.textContent = text;
    };

    setProgress(20, 'Connecting to update channel & creating safety backup...');

    try {
      const res = await fetch('api.php?action=apply_update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          download_url: manifest?.download_url || 'version.json',
          backup: chkBackup ? chkBackup.checked : true
        })
      });

      setProgress(65, 'Unpacking core files & verifying integrity...');
      const data = await res.json();

      if (data.success) {
        setProgress(100, 'Update complete! Refreshing AetherBuilder in 2 seconds...');
        this.canvas?.showToast('🎉 Core successfully updated! Reloading...', 'success');
        setTimeout(() => {
          window.location.reload(true);
        }, 1800);
      } else {
        setProgress(100, 'Update paused: ' + (data.error || 'Server rejected update'));
        if (fill) fill.style.background = '#ef4444';
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = '<span>⚠️</span> Try Again or Use Manual ZIP';
        }
      }
    } catch (err) {
      setProgress(100, 'Network error. Try Manual ZIP Drop.');
      if (fill) fill.style.background = '#ef4444';
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<span>⚠️</span> Retry';
      }
    }
  }

  bindManualZipUpload(modal) {
    const dropzone = modal.querySelector('#update-zip-dropzone');
    const fileInput = modal.querySelector('#update-zip-file-input');
    const btnSelect = modal.querySelector('#btn-select-zip-file');
    const selectedInfo = modal.querySelector('#manual-file-selected-info');
    const nameLabel = modal.querySelector('#selected-zip-name');
    const btnUpload = modal.querySelector('#btn-upload-manual-zip');

    if (!dropzone || !fileInput) return;

    btnSelect?.addEventListener('click', () => fileInput.click());
    dropzone.addEventListener('click', (e) => {
      if (e.target !== btnSelect) fileInput.click();
    });

    ['dragenter', 'dragover'].forEach(evt => {
      dropzone.addEventListener(evt, (e) => {
        e.preventDefault();
        dropzone.classList.add('dragover');
      });
    });

    ['dragleave', 'drop'].forEach(evt => {
      dropzone.addEventListener(evt, (e) => {
        e.preventDefault();
        dropzone.classList.remove('dragover');
      });
    });

    let selectedFile = null;

    dropzone.addEventListener('drop', (e) => {
      const files = e.dataTransfer.files;
      if (files && files.length > 0 && files[0].name.endsWith('.zip')) {
        selectedFile = files[0];
        showSelected();
      } else {
        alert('Please drop a valid .zip update package.');
      }
    });

    fileInput.addEventListener('change', () => {
      if (fileInput.files && fileInput.files.length > 0) {
        selectedFile = fileInput.files[0];
        showSelected();
      }
    });

    function showSelected() {
      if (nameLabel && selectedFile) nameLabel.textContent = selectedFile.name + ' (' + Math.round(selectedFile.size / 1024) + ' KB)';
      if (selectedInfo) selectedInfo.style.display = 'flex';
    }

    btnUpload?.addEventListener('click', async () => {
      if (!selectedFile) return;
      btnUpload.disabled = true;
      btnUpload.innerHTML = '<span>⏳</span> Installing...';

      const formData = new FormData();
      formData.append('update_zip', selectedFile);
      formData.append('backup', '1');

      try {
        const res = await fetch('api.php?action=upload_update_zip', {
          method: 'POST',
          body: formData
        });
        const data = await res.json();
        if (data.success) {
          btnUpload.innerHTML = '<span>✅</span> Installed!';
          alert('Update successfully applied! AetherBuilder will now reload.');
          window.location.reload(true);
        } else {
          alert('Update error: ' + (data.error || 'Failed to install zip'));
          btnUpload.disabled = false;
          btnUpload.innerHTML = '<span>🚀</span> Unpack & Install';
        }
      } catch (err) {
        alert('Network error while uploading update package.');
        btnUpload.disabled = false;
        btnUpload.innerHTML = '<span>🚀</span> Unpack & Install';
      }
    });
  }

  async loadBackupsList(modal) {
    const container = modal.querySelector('#backups-list-container');
    if (!container) return;
    try {
      const res = await fetch('api.php?action=list_backups');
      if (!res.ok) throw new Error('Failed to fetch backups');
      const data = await res.json();
      if (data.backups && data.backups.length > 0) {
        container.innerHTML = data.backups.map(b => \`
          <div style="display:flex; justify-content:space-between; align-items:center; padding:10px 14px; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.07); border-radius:8px;">
            <div>
              <div style="font-weight:600; font-size:0.83rem; color:#e2e8f0;">\${b.filename}</div>
              <div style="font-size:0.72rem; color:var(--text-dim);">\${b.date} • \${Math.round(b.size / 1024)} KB</div>
            </div>
            <a href="data/backups/\${b.filename}" download class="topbar-btn topbar-btn-sm" style="text-decoration:none; padding:4px 10px; font-size:0.75rem;">
              <span>⬇️</span> Download
            </a>
          </div>
        \`).join('');
      } else {
        container.innerHTML = '<div style="color:var(--text-dim); font-size:0.8rem; text-align:center; padding:20px;">No pre-update backups found yet. Backups are created automatically before each update.</div>';
      }
    } catch (err) {
      container.innerHTML = \`<div style="color:#ef4444; font-size:0.8rem; text-align:center; padding:20px;">Could not list backups: \${err.message}</div>\`;
    }
  }
`;

// Insert methods right before the closing brace of class AetherApp
const classEnd = `  }\n}\n\n// Bootstrap application on window load`;
if (code.includes(classEnd)) {
  code = code.replace(classEnd, `  }\n` + updaterMethods + `\n}\n\n// Bootstrap application on window load`);
  console.log('Updater methods appended to AetherApp class.');
} else {
  console.log('Could not find classEnd marker, looking for last closing brace...');
  const lastIndex = code.lastIndexOf('}');
  const secondLastIndex = code.lastIndexOf('}', lastIndex - 1);
  code = code.slice(0, secondLastIndex) + updaterMethods + '\n' + code.slice(secondLastIndex);
}

fs.writeFileSync(appPath, code, 'utf8');
console.log('js/app.js successfully updated!');

