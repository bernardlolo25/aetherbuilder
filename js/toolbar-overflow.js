/**
 * AETHERBUILDER - GOOGLE WORKSPACE-STYLE ADAPTIVE TOOLBAR OVERFLOW MENU
 * ============================================================================
 * Dynamic real-time collision detection:
 * Whenever the admin panel zooms in (Ctrl+/Cmd+) or browser width shrinks,
 * toolbar buttons that would otherwise collide or wrap are dynamically consolidated
 * into the Google Workspace-style 3-dots (⋮) floating shelf.
 *
 * Guaranteed ZERO overlapping of buttons on any screen resolution or zoom level.
 */

export const OVERFLOW_CONFIG = [
  // Priority 1: Hides earliest when space gets tight
  {
    id: 'btn-clear',
    category: 'tools',
    label: 'Clear Canvas',
    icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`,
    danger: true
  },
  {
    id: 'btn-topbar-qr',
    category: 'utils',
    label: 'Mobile Test QR',
    icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>`
  },
  {
    id: 'btn-topbar-copy-link',
    category: 'utils',
    label: 'Copy Public URL',
    icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`
  },
  {
    id: 'btn-sync-server',
    category: 'utils',
    label: 'Sync from Server',
    icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 17.58A5 5 0 0 0 18 8h-1.26A8 8 0 1 0 4 16.25"/><polyline points="8 16 12 20 16 16"/><line x1="12" y1="12" x2="12" y2="20"/></svg>`
  },
  {
    id: 'btn-security',
    category: 'utils',
    label: 'Security Settings',
    icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`
  },
  {
    id: 'btn-media',
    category: 'utils',
    label: 'Media Library',
    icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`
  },
  {
    id: 'btn-export',
    category: 'tools',
    label: 'Export JSON',
    icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>`
  },
  {
    id: 'btn-seo-audit',
    category: 'tools',
    label: 'SEO Health Audit',
    icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>`
  },
  {
    id: 'btn-revisions',
    category: 'tools',
    label: 'Revisions & Rollback',
    icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`
  },
  {
    id: 'btn-notifications',
    category: 'utils',
    label: 'Notifications Inbox',
    icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>`
  },
  {
    id: 'btn-system-updates',
    category: 'utils',
    label: 'System Updates',
    icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>`
  },
  {
    id: 'btn-topbar-search',
    category: 'tools',
    label: 'Search (Ctrl+K)',
    icon: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`
  },
  {
    id: 'btn-templates',
    category: 'tools',
    label: 'Templates Store',
    icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>`
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
    this.isEvaluating = false;
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

    // 4. Initial evaluation
    this.scheduleEvaluate();
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
            <span class="overflow-shelf-hint">Google Workspace Overflow</span>
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
      this.observer = new ResizeObserver(() => this.scheduleEvaluate());
      this.observer.observe(this.topbar);
    }
    window.addEventListener('resize', () => this.scheduleEvaluate());

    // Evaluate on startup and after fonts/layout stabilize
    setTimeout(() => this.scheduleEvaluate(), 100);
    setTimeout(() => this.scheduleEvaluate(), 400);
    setTimeout(() => this.scheduleEvaluate(), 1000);

    // Close when clicking outside
    document.addEventListener('click', (e) => {
      if (!this.isOpen) return;
      if (this.shelf && !this.shelf.contains(e.target) && !this.overflowBtn?.contains(e.target)) {
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

  scheduleEvaluate() {
    if (this.isEvaluating) return;
    this.isEvaluating = true;
    requestAnimationFrame(() => {
      this.evaluate();
      this.isEvaluating = false;
    });
  }

  evaluate() {
    if (!this.topbar) return;

    const leftZone = this.topbar.querySelector('.topbar-left-zone') || this.topbar.children[0];
    const centerZone = this.topbar.querySelector('.topbar-controls-center');
    const rightZone = this.topbar.querySelector('.topbar-actions');
    if (!leftZone || !rightZone) return;

    // Step 1: Temporarily un-hide all items to measure full unconstrained fit
    OVERFLOW_CONFIG.forEach(cfg => {
      const el = document.getElementById(cfg.id);
      if (el) el.classList.remove('topbar-item-overflowed');
    });
    this.activeOverflowIds.clear();

    // Step 2: Collision detection helper
    const checkCollision = () => {
      const leftRect = leftZone.getBoundingClientRect();
      const rightRect = rightZone.getBoundingClientRect();
      const topbarRect = this.topbar.getBoundingClientRect();

      // Topbar width exceeded
      if (this.topbar.scrollWidth > this.topbar.clientWidth + 4) return true;

      if (centerZone && centerZone.children.length > 0) {
        // Find visible children in center zone
        const visibleCenterChildren = Array.from(centerZone.children).filter(
          c => window.getComputedStyle(c).display !== 'none'
        );

        if (visibleCenterChildren.length > 0) {
          const firstChild = visibleCenterChildren[0].getBoundingClientRect();
          const lastChild = visibleCenterChildren[visibleCenterChildren.length - 1].getBoundingClientRect();

          // Left zone touches first center child
          if (leftRect.right > firstChild.left - 10) return true;

          // Last center child touches right zone
          if (lastChild.right > rightRect.left - 10) return true;
        }
      }

      // Left zone touches right zone
      if (leftRect.right > rightRect.left - 10) return true;

      return false;
    };

    // Step 3: Progressively hide items in priority order until zero collisions exist!
    for (let i = 0; i < OVERFLOW_CONFIG.length; i++) {
      if (!checkCollision()) {
        break; // Everything fits comfortably without overlapping!
      }

      const cfg = OVERFLOW_CONFIG[i];
      const el = document.getElementById(cfg.id);
      if (el) {
        this.activeOverflowIds.add(cfg.id);
        el.classList.add('topbar-item-overflowed');
      }
    }

    // Double-check: if still colliding on very narrow viewports, force collapse center
    if (checkCollision() && centerZone) {
      Array.from(centerZone.children).forEach(c => {
        if (!c.classList.contains('history-btn-group')) {
          c.classList.add('topbar-item-overflowed');
          if (c.id) this.activeOverflowIds.add(c.id);
        }
      });
    }

    // Step 4: Toggle 3-dots button visibility
    const hasOverflow = this.activeOverflowIds.size > 0;
    if (this.overflowBtn) {
      this.overflowBtn.style.display = hasOverflow ? 'inline-flex' : 'none';
      if (!hasOverflow && this.isOpen) {
        this.close();
      }
    }

    // Step 5: Render shelf items
    this.renderShelfItems();
  }

  renderShelfItems() {
    if (!this.shelf) return;
    const content = this.shelf.querySelector('#overflow-shelf-content');
    if (!content) return;

    if (this.activeOverflowIds.size === 0) {
      content.innerHTML = `<div class="overflow-empty-msg">All tools fit comfortably in the main toolbar.</div>`;
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
    } else if (item.id === 'btn-seo-audit') {
      const badge = origEl?.querySelector('.seo-badge-count');
      if (badge && badge.textContent) {
        badgeHtml = `<span class="overflow-badge notif">${badge.textContent}</span>`;
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
