/**
 * AetherBuilder Universal Command Palette (Ctrl+K / Cmd+K)
 * Inspired by Linear, Figma, and VS Code.
 * Fast, keyboard-first navigation for actions, pages, widgets, and templates.
 */

import { state } from './state.js';
import { WIDGET_REGISTRY } from './widgets.js';
import { addonManager } from './addons.js';

export class CommandPalette {
  constructor() {
    this.isOpen = false;
    this.app = null;
    this.overlay = null;
    this.input = null;
    this.resultsList = null;
    this.items = [];
    this.selectedIndex = 0;
  }

  init(appInstance) {
    this.app = appInstance;
    this.createDom();
    this.bindEvents();
  }

  createDom() {
    if (document.getElementById('aether-command-palette')) {
      this.overlay = document.getElementById('aether-command-palette');
      this.input = document.getElementById('cmd-palette-input');
      this.resultsList = document.getElementById('cmd-palette-results');
      return;
    }

    const overlay = document.createElement('div');
    overlay.id = 'aether-command-palette';
    overlay.className = 'command-palette-overlay';

    overlay.innerHTML = `
      <div class="command-palette-modal" role="dialog" aria-modal="true" aria-label="Command Palette">
        <div class="command-palette-search-wrap">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <input type="text" id="cmd-palette-input" class="command-palette-input" placeholder="Search actions, widgets, pages, or add-ons..." autocomplete="off" spellcheck="false" />
          <kbd style="font-size: 0.68rem; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12); border-radius: 4px; padding: 2px 6px; color: #94a3b8;">ESC</kbd>
        </div>
        <div id="cmd-palette-results" class="command-palette-list"></div>
        <div class="command-palette-footer">
          <span><kbd>↑</kbd> <kbd>↓</kbd> Navigate</span>
          <span><kbd>↵</kbd> Select</span>
          <span><kbd>ESC</kbd> Close</span>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    this.overlay = overlay;
    this.input = overlay.querySelector('#cmd-palette-input');
    this.resultsList = overlay.querySelector('#cmd-palette-results');
  }

  bindEvents() {
    // Global shortcut listener: Ctrl+K or Cmd+K
    window.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        e.stopPropagation();
        this.toggle();
      }
    });

    // Close on overlay backdrop click
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) {
        this.close();
      }
    });

    // Search input listener
    this.input.addEventListener('input', () => {
      this.filterItems(this.input.value);
    });

    // Keyboard navigation inside input
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        this.moveSelection(1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        this.moveSelection(-1);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        this.executeSelected();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        this.close();
      }
    });
  }

  open() {
    if (this.isOpen) return;
    this.isOpen = true;
    this.overlay.classList.add('is-open');
    this.input.value = '';
    this.selectedIndex = 0;
    this.filterItems('');
    setTimeout(() => {
      this.input.focus();
    }, 20);
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.overlay.classList.remove('is-open');
    this.input.blur();
  }

  toggle() {
    if (this.isOpen) this.close();
    else this.open();
  }

  getAllItems() {
    const list = [];
    const app = this.app || window._aetherApp;

    // ── 1. GLOBAL QUICK ACTIONS ──────────────────────────────────────────────
    list.push({
      category: 'Actions',
      icon: '🚀',
      title: 'Publish Live Website',
      description: 'Deploy the latest draft to the live production site',
      badge: 'Action',
      run: () => {
        state.publishToLive();
        app?.canvas?.showToast('🚀 Published live successfully!', 'success');
      }
    });

    list.push({
      category: 'Actions',
      icon: '🖼️',
      title: 'Open Free Template Store',
      description: 'Explore and 1-click install high-conversion landing page templates',
      badge: 'Store',
      run: () => app?.showTemplatesModal?.()
    });

    list.push({
      category: 'Actions',
      icon: '🛍️',
      title: 'Open Add-on & Plugin Store',
      description: 'Browse the cloud marketplace for widgets, modules, and utilities',
      badge: 'Store',
      run: () => app?.showStoreModal?.()
    });

    list.push({
      category: 'Actions',
      icon: '🛠️',
      title: 'Add-on Maker Studio',
      description: 'Code and design custom widgets with live preview',
      badge: 'Studio',
      run: () => app?.openAddonMaker?.()
    });

    list.push({
      category: 'Actions',
      icon: '⏱️',
      title: 'Revisions & Version Rollback',
      description: 'View snapshots of past live publications and restore any version',
      badge: 'History',
      run: () => app?.showRevisionsModal?.()
    });

    list.push({
      category: 'Actions',
      icon: '🔍',
      title: 'Pre-Publish SEO Audit',
      description: 'Check meta titles, open graph cards, heading hierarchy and alt tags',
      badge: 'Audit',
      run: () => app?.runSeoAudit?.()
    });

    list.push({
      category: 'Actions',
      icon: '💾',
      title: 'Export Website JSON',
      description: 'Download complete website schema backup for migration or archive',
      badge: 'Backup',
      run: () => app?.exportSiteJson?.()
    });

    list.push({
      category: 'Actions',
      icon: '🧭',
      title: 'Sync Navigation Menu from Pages',
      description: 'Auto-populate site navbar links with all published pages',
      badge: 'Navigation',
      run: () => {
        const count = state.syncGlobalMenuFromPages();
        app?.canvas?.showToast(`🧭 Synced ${count} pages into Site Navigation Menu!`, 'success');
      }
    });

    list.push({
      category: 'Actions',
      icon: '📱',
      title: 'Toggle Mobile Preview',
      description: 'Switch canvas viewport to simulated mobile smartphone screen',
      badge: 'View',
      run: () => app?.setDeviceMode?.('mobile')
    });

    list.push({
      category: 'Actions',
      icon: '💻',
      title: 'Toggle Desktop Preview',
      description: 'Switch canvas viewport to full desktop resolution',
      badge: 'View',
      run: () => app?.setDeviceMode?.('desktop')
    });

    list.push({
      category: 'Actions',
      icon: '↩️',
      title: 'Undo Changes',
      description: 'Revert the last modification on the canvas (Ctrl+Z)',
      badge: 'History',
      run: () => state.undo()
    });

    list.push({
      category: 'Actions',
      icon: '↪️',
      title: 'Redo Changes',
      description: 'Re-apply the undone modification (Ctrl+Y)',
      badge: 'History',
      run: () => state.redo()
    });

    list.push({
      category: 'Actions',
      icon: '🔗',
      title: 'Copy Live Website URL',
      description: 'Copy the publicly accessible URL of this site to clipboard',
      badge: 'Link',
      run: () => app?.copyLiveUrl?.()
    });

    list.push({
      category: 'Actions',
      icon: '📲',
      title: 'Show Mobile QR Code',
      description: 'Scan with smartphone camera to preview site on real device',
      badge: 'Preview',
      run: () => app?.showQrModal?.()
    });

    list.push({
      category: 'Actions',
      icon: '⚡',
      title: 'System Updates & Info',
      description: 'Check AetherBuilder core updates and install patches',
      badge: 'System',
      run: () => app?.showUpdateModal?.()
    });

    list.push({
      category: 'Actions',
      icon: '🗑️',
      title: 'Clear Canvas Sections',
      description: 'Empty all sections on the current active page',
      badge: 'Canvas',
      run: () => app?.clearCanvas?.()
    });

    // ── 2. SITE PAGES ────────────────────────────────────────────────────────
    if (Array.isArray(state.pages)) {
      state.pages.forEach(p => {
        const isCurrent = p.id === state.currentPageId;
        list.push({
          category: 'Pages',
          icon: isCurrent ? '📍' : '📄',
          title: `Switch to: ${p.name || p.title || p.slug || 'Untitled Page'}`,
          description: `Page slug: /${p.slug || ''} (${(p.sections || []).length} sections)${isCurrent ? ' • Active' : ''}`,
          badge: isCurrent ? 'Active' : 'Page',
          run: () => {
            state.setCurrentPage(p.id);
            app?.canvas?.showToast(`Switched to page "${p.name || p.title}"`, 'info');
          }
        });
      });

      list.push({
        category: 'Pages',
        icon: '➕',
        title: 'Create New Page',
        description: 'Add a new blank page or sub-page to your website',
        badge: 'Page',
        run: () => app?.showAddPageModal?.()
      });
    }

    // ── 3. WIDGETS, BLOCKS & ADD-ONS ─────────────────────────────────────────
    Object.entries(WIDGET_REGISTRY).forEach(([key, w]) => {
      const isComp = w.category === 'components';
      const isAddon = w.isAddon || w.category === 'addons';
      let catName = 'Add Section / Widget';
      let badgeLabel = 'Widget';

      if (isComp) {
        catName = 'Reusable Components';
        badgeLabel = 'Block';
      } else if (isAddon) {
        catName = 'Installed Add-ons';
        badgeLabel = 'Add-on';
      }

      list.push({
        category: catName,
        icon: w.icon || (isComp ? '📦' : (isAddon ? '🧩' : '🔲')),
        title: `Insert ${w.name}`,
        description: w.description || `Add ${w.name} section to the canvas`,
        badge: badgeLabel,
        run: () => {
          state.addSection(key);
          app?.canvas?.showToast(`Added section: ${w.name}`, 'success');
        }
      });
    });

    return list;
  }

  filterItems(query) {
    const q = (query || '').toLowerCase().trim();
    const all = this.getAllItems();

    if (!q) {
      this.items = all.slice(0, 40);
    } else {
      this.items = all.filter(item => {
        const titleMatch = item.title.toLowerCase().includes(q);
        const descMatch = (item.description || '').toLowerCase().includes(q);
        const catMatch = (item.category || '').toLowerCase().includes(q);
        const badgeMatch = (item.badge || '').toLowerCase().includes(q);
        return titleMatch || descMatch || catMatch || badgeMatch;
      }).slice(0, 50);
    }

    this.selectedIndex = 0;
    this.renderResults();
  }

  renderResults() {
    if (this.items.length === 0) {
      this.resultsList.innerHTML = `
        <div style="padding: 32px 20px; text-align: center; color: #64748b; font-size: 0.9rem;">
          No matching commands, pages, or widgets found.
        </div>
      `;
      return;
    }

    // Group items by category preserving insertion order
    let html = '';
    let lastCategory = null;

    this.items.forEach((item, index) => {
      if (item.category !== lastCategory) {
        lastCategory = item.category;
        html += `<div class="command-palette-group-title">${item.category}</div>`;
      }

      const isSelected = index === this.selectedIndex;
      html += `
        <div class="command-palette-item ${isSelected ? 'is-selected' : ''}" data-index="${index}">
          <div class="command-palette-item-left">
            <div class="command-palette-item-icon">${item.icon}</div>
            <div>
              <div class="command-palette-item-title">${this.escapeHtml(item.title)}</div>
              <div class="command-palette-item-desc">${this.escapeHtml(item.description)}</div>
            </div>
          </div>
          <div class="command-palette-badge">${item.badge || 'Run'}</div>
        </div>
      `;
    });

    this.resultsList.innerHTML = html;

    // Attach click handlers
    this.resultsList.querySelectorAll('.command-palette-item').forEach(el => {
      el.addEventListener('mouseenter', () => {
        const idx = parseInt(el.getAttribute('data-index'), 10);
        if (!isNaN(idx)) {
          this.selectedIndex = idx;
          this.updateSelectionClasses();
        }
      });
      el.addEventListener('click', () => {
        const idx = parseInt(el.getAttribute('data-index'), 10);
        if (!isNaN(idx)) {
          this.selectedIndex = idx;
          this.executeSelected();
        }
      });
    });

    this.scrollSelectedIntoView();
  }

  updateSelectionClasses() {
    this.resultsList.querySelectorAll('.command-palette-item').forEach((el, idx) => {
      if (idx === this.selectedIndex) {
        el.classList.add('is-selected');
      } else {
        el.classList.remove('is-selected');
      }
    });
  }

  moveSelection(delta) {
    if (this.items.length === 0) return;
    this.selectedIndex = (this.selectedIndex + delta + this.items.length) % this.items.length;
    this.updateSelectionClasses();
    this.scrollSelectedIntoView();
  }

  scrollSelectedIntoView() {
    const selectedEl = this.resultsList.querySelector('.command-palette-item.is-selected');
    if (selectedEl) {
      selectedEl.scrollIntoView({ block: 'nearest' });
    }
  }

  executeSelected() {
    const item = this.items[this.selectedIndex];
    if (item && typeof item.run === 'function') {
      this.close();
      try {
        item.run();
      } catch (err) {
        console.error('[CommandPalette] Error executing action:', err);
      }
    }
  }

  escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}

export const commandPalette = new CommandPalette();

