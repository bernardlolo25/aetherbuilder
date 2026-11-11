/**
 * AETHERBUILDER - GOOGLE WORKSPACE-STYLE ADAPTIVE TOOLBAR OVERFLOW MENU
 * ============================================================================
 * When the admin panel zooms in (Ctrl+/Cmd+) or when the screen width shrinks,
 * toolbar items that no longer fit comfortably are consolidated into a Google
 * Workspace-style "More actions" (⋮) floating bar.
 *
 * All actions in the overflow bar use the Proxy Click Pattern to trigger the
 * original buttons, guaranteeing 100% feature parity with zero breaking changes.
 */

export const OVERFLOW_CONFIG = [
  // Priority 1: Hides earliest when space gets tight (< 1420px or zoom > 110%)
  {
    id: 'btn-clear',
    category: 'tools',
    label: 'Clear Canvas',
    icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`,
    danger: true,
    minWidth: 1420
  },
  {
    id: 'btn-topbar-qr',
    category: 'utils',
    label: 'Mobile Test QR',
    icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>`,
    minWidth: 1360
  },
  {
    id: 'btn-topbar-copy-link',
    category: 'utils',
    label: 'Copy Public URL',
    icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`,
    minWidth: 1300
  },
  {
    id: 'btn-sync-server',
    category: 'utils',
    label: 'Sync from Server',
    icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 17.58A5 5 0 0 0 18 8h-1.26A8 8 0 1 0 4 16.25"/><polyline points="8 16 12 20 16 16"/><line x1="12" y1="12" x2="12" y2="20"/></svg>`,
    minWidth: 1240
  },
  {
    id: 'btn-security',
    category: 'utils',
    label: 'Security Settings',
    icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
    minWidth: 1180
  },
  {
    id: 'btn-media',
    category: 'utils',
    label: 'Media Library',
    icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`,
    minWidth: 1120
  },
  {
    id: 'btn-export',
    category: 'tools',
    label: 'Export JSON',
    icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>`,
    minWidth: 1060
  },
  {
    id: 'btn-seo-audit',
    category: 'tools',
    label: 'SEO Health Audit',
    icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>`,
    minWidth: 1000
  },
  {
    id: 'btn-revisions',
    category: 'tools',
    label: 'Revisions & Rollback',
    icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
    minWidth: 940
  },
  {
    id: 'btn-notifications',
    category: 'utils',
    label: 'Notifications Inbox',
    icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>`,
    minWidth: 880
  },
  {
    id: 'btn-system-updates',
    category: 'utils',
    label: 'System Updates',
    icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>`,
    minWidth: 820
  }
];

export class ToolbarOverflow {
  constructor() {
    this.topbar = null;
    this.overflowBtn = null;
    this.shelf = null;
    this.isOpen = false;
    this.observer = null;
    this.activeOverflowIds = new Set();
  }

  init() {
    this.topbar = document.querySelector('.builder-topbar');
    if (!this.topbar) return;

    // 1. Create or bind the 3-dots trigger button
    this.ensureTriggerButton();

    // 2. Create the floating Google Workspace-style secondary shelf
    this.ensureShelf();

    // 3. Set up responsive listeners
    this.setupListeners();

    // 4. Initial measurement
    this.evaluate();
  }

  ensureTriggerButton() {
    let btn = document.getElementById('btn-topbar-overflow');
    if (!btn) {
      btn = document.createElement('button');
      btn.type = 'button';
      btn.id = 'btn-topbar-overflow';
      btn.className = 'tool-icon-btn topbar-overflow-trigger';
      btn.title = 'More tools & actions (Google Workspace overflow)';
      btn.setAttribute('aria-label', 'More actions');
      btn.setAttribute('aria-expanded', 'false');
      btn.innerHTML = `
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="1.5"></circle>
          <circle cx="12" cy="5" r="1.5"></circle>
          <circle cx="12" cy="19" r="1.5"></circle>
        </svg>
      `;

      // Insert in .topbar-actions right before Publish button (or at end of actions)
      const actions = this.topbar.querySelector('.topbar-actions');
      const publishBtn = this.topbar.querySelector('#btn-publish');
      if (actions) {
        if (publishBtn) actions.insertBefore(btn, publishBtn);
        else actions.appendChild(btn);
      }
    }

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggle();
    });

    this.overflowBtn = btn;
  }

  ensureShelf() {
    let shelf = document.getElementById('topbar-overflow-shelf');
    if (!shelf) {
      shelf = document.createElement('div');
      shelf.id = 'topbar-overflow-shelf';
      shelf.className = 'topbar-overflow-shelf';
      shelf.innerHTML = `
        <div class="overflow-shelf-inner">
          <div class="overflow-shelf-header">
            <span class="overflow-shelf-title">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg>
              <span>More Actions</span>
            </span>
            <span class="overflow-shelf-hint">Consolidated for screen space</span>
          </div>
          <div class="overflow-shelf-content" id="overflow-shelf-content">
            <!-- Dynamic Groups Rendered Here -->
          </div>
        </div>
      `;

      // Mount inside builder-shell directly beneath topbar
      const shell = document.querySelector('.builder-shell') || document.body;
      shell.appendChild(shelf);
    }
    this.shelf = shelf;
  }

  setupListeners() {
    // ResizeObserver on the topbar for pixel-perfect detection across zooms
    if (window.ResizeObserver) {
      this.observer = new ResizeObserver(() => this.evaluate());
      this.observer.observe(this.topbar);
    }
    window.addEventListener('resize', () => this.evaluate());

    // Evaluate on startup and after fonts/layout stabilize
    setTimeout(() => this.evaluate(), 100);
    setTimeout(() => this.evaluate(), 500);

    // Close when clicking outside
    document.addEventListener('click', (e) => {
      if (!this.isOpen) return;
      if (this.shelf && !this.shelf.contains(e.target) && !this.overflowBtn.contains(e.target)) {
        this.close();
      }
    });

    // Close on Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen) {
        this.close();
      }
    });
  }

  evaluate() {
    if (!this.topbar) return;
    const topbarWidth = this.topbar.clientWidth || window.innerWidth;

    this.activeOverflowIds.clear();

    // Check each configured item against current width
    OVERFLOW_CONFIG.forEach(cfg => {
      const el = document.getElementById(cfg.id);
      if (!el) return;

      const shouldOverflow = topbarWidth < cfg.minWidth;
      if (shouldOverflow) {
        this.activeOverflowIds.add(cfg.id);
        el.classList.add('topbar-item-overflowed');
      } else {
        el.classList.remove('topbar-item-overflowed');
      }
    });

    // Also check if center or actions containers are still scroll-overflowing
    const center = this.topbar.querySelector('.topbar-controls-center');
    const actions = this.topbar.querySelector('.topbar-actions');
    const isCrowded = (center && center.scrollWidth > center.clientWidth + 5) ||
                      (actions && actions.scrollWidth > actions.clientWidth + 5);

    if (isCrowded && this.activeOverflowIds.size === 0) {
      // Force overflow tier 1 items
      OVERFLOW_CONFIG.slice(0, 3).forEach(cfg => {
        const el = document.getElementById(cfg.id);
        if (el) {
          this.activeOverflowIds.add(cfg.id);
          el.classList.add('topbar-item-overflowed');
        }
      });
    }

    // Toggle 3-dots button visibility
    const hasOverflow = this.activeOverflowIds.size > 0;
    if (this.overflowBtn) {
      this.overflowBtn.style.display = hasOverflow ? 'inline-flex' : 'none';
      if (!hasOverflow && this.isOpen) {
        this.close();
      }
    }

    // Re-render shelf content if open or if items changed
    this.renderShelfItems();
  }

  renderShelfItems() {
    if (!this.shelf) return;
    const content = this.shelf.querySelector('#overflow-shelf-content');
    if (!content) return;

    if (this.activeOverflowIds.size === 0) {
      content.innerHTML = `<div class="overflow-empty-msg">All tools fit in main toolbar.</div>`;
      return;
    }

    // Group items by category (tools vs utils)
    const tools = [];
    const utils = [];

    OVERFLOW_CONFIG.forEach(cfg => {
      if (!this.activeOverflowIds.has(cfg.id)) return;
      if (cfg.category === 'tools') tools.push(cfg);
      else utils.push(cfg);
    });

    let html = '';

    if (tools.length > 0) {
      html += `
        <div class="overflow-group">
          <div class="overflow-group-label">Tools &amp; Canvas</div>
          <div class="overflow-group-grid">
            ${tools.map(item => this.renderShelfBtn(item)).join('')}
          </div>
        </div>
      `;
    }

    if (utils.length > 0) {
      html += `
        <div class="overflow-group">
          <div class="overflow-group-label">Utilities &amp; System</div>
          <div class="overflow-group-grid">
            ${utils.map(item => this.renderShelfBtn(item)).join('')}
          </div>
        </div>
      `;
    }

    content.innerHTML = html;

    // Attach Proxy Click Handlers
    content.querySelectorAll('.overflow-shelf-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const targetId = btn.dataset.targetId;
        this.close();
        const originalEl = document.getElementById(targetId);
        if (originalEl) {
          originalEl.click();
        }
      });
    });
  }

  renderShelfBtn(item) {
    const origEl = document.getElementById(item.id);
    const dangerClass = item.danger ? 'is-danger' : '';

    // Check for badges
    let badgeHtml = '';
    if (item.id === 'btn-notifications') {
      const b = origEl?.querySelector('#notif-badge');
      if (b && b.style.display !== 'none' && b.textContent !== '0') {
        badgeHtml = `<span class="overflow-badge notif">${b.textContent}</span>`;
      }
    } else if (item.id === 'btn-system-updates') {
      const dot = origEl?.querySelector('#update-badge-dot');
      if (dot && dot.style.display !== 'none') {
        badgeHtml = `<span class="overflow-badge update">●</span>`;
      }
    }

    return `
      <button type="button" class="overflow-shelf-btn ${dangerClass}" data-target-id="${item.id}" title="${item.label}">
        <span class="overflow-btn-icon">${item.icon}</span>
        <span class="overflow-btn-label">${item.label}</span>
        ${badgeHtml}
      </button>
    `;
  }

  toggle() {
    if (this.isOpen) this.close();
    else this.open();
  }

  open() {
    if (!this.shelf || this.activeOverflowIds.size === 0) return;
    this.isOpen = true;
    this.renderShelfItems();
    this.shelf.classList.add('is-open');
    if (this.overflowBtn) {
      this.overflowBtn.classList.add('is-active');
      this.overflowBtn.setAttribute('aria-expanded', 'true');
    }
  }

  close() {
    if (!this.shelf) return;
    this.isOpen = false;
    this.shelf.classList.remove('is-open');
    if (this.overflowBtn) {
      this.overflowBtn.classList.remove('is-active');
      this.overflowBtn.setAttribute('aria-expanded', 'false');
    }
  }
}

export const toolbarOverflow = new ToolbarOverflow();
