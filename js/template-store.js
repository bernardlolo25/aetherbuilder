/**
 * AETHERBUILDER - FREE TEMPLATE STORE & DEPENDENCY RESOLVER
 * ============================================================================
 * Manages the Free Template Store and auto-detects required add-on dependencies.
 * All templates in the Template Store are 100% FREE.
 *
 * Each template explicitly tracks and displays its required add-ons so that users
 * never get broken pages. 1-Click auto-install provides seamless rendering.
 */

import { state } from './state.js';
import { addonManager } from './addons.js';
import { addonStore } from './addon-store.js';
import { WIDGET_REGISTRY } from './widgets.js';
import { TEMPLATES } from './templates.js';

export const DEFAULT_GOOGLE_THEMES_FEED_URL = 'https://script.google.com/macros/s/AKfycbwhcE67tXkWdZA8Hhttu9D6SU2ifk8KXUEBBRkaUhCgQfTejvI45KAaGiyZnHvN334Asw/exec?type=themes';

export class TemplateStore {
  constructor() {
    this.templates = [];
    this.isInitialized = false;
    this.activeFilter = 'all';
    this.searchQuery = '';
  }

  async init() {
    if (this.isInitialized) return;
    this.isInitialized = true;

    // 1. Instant hydration from localStorage cache (0ms, no network wait)
    let serverTemplates = null;
    try {
      const raw = localStorage.getItem('aether_template_store');
      if (raw) serverTemplates = JSON.parse(raw);
    } catch {}

    // 2. Try loading from local PHP server data/templates.json
    if (!serverTemplates) {
      try {
        const apiBase = (typeof window._aetherApiBase !== 'undefined') ? window._aetherApiBase : 'api.php';
        const res = await fetch(`${apiBase}?action=get_templates&_t=${Date.now()}`);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data) && data.length > 0) {
            serverTemplates = data;
          }
        }
      } catch {}
    }

    if (Array.isArray(serverTemplates) && serverTemplates.length > 0) {
      this.templates = serverTemplates;
    } else {
      // 3. Fallback: Seed from built-in templates
      this.templates = this.getSeedTemplates();
      this.save(true);
    }

    // 4. Guaranteed Sanitization: ensure every template has full metadata & working thumbnail
    const seeds = this.getSeedTemplates();
    this.templates = this.templates.map(tmpl => {
      const match = seeds.find(s => s.id === tmpl.id);
      if (match) {
        if (!tmpl.thumbnail) tmpl.thumbnail = match.thumbnail;
        if (!tmpl.category) tmpl.category = match.category;
        if (!tmpl.description) tmpl.description = match.description;
        if (!tmpl.requiredAddons || tmpl.requiredAddons.length === 0) {
          tmpl.requiredAddons = match.requiredAddons || [];
        }
      }
      if (!tmpl.thumbnail) {
        tmpl.thumbnail = 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&w=800&q=80';
      }
      return tmpl;
    });

    // 5. Stale-While-Revalidate: background sync from Google Sheets Web App (non-blocking)
    this.scheduleBackgroundSync();
  }

  scheduleBackgroundSync() {
    if (typeof window === 'undefined') return;
    setTimeout(async () => {
      try {
        const res = await fetch(DEFAULT_GOOGLE_THEMES_FEED_URL);
        if (!res.ok) return;
        const data = await res.json();
        if (!Array.isArray(data) || data.length === 0) return;

        // Merge incoming items: Google Sheets entries update or extend the local list
        let changed = false;
        data.forEach(item => {
          if (!item.id || !item.name) return;
          const idx = this.templates.findIndex(t => t.id === item.id);
          if (idx !== -1) {
            // Update existing — preserve local sections if remote has none
            const merged = { ...this.templates[idx], ...item };
            if (!merged.sections || merged.sections.length === 0) {
              merged.sections = this.templates[idx].sections || [];
            }
            this.templates[idx] = merged;
          } else {
            // New entry from Google Sheets
            this.templates.push(item);
          }
          changed = true;
        });

        if (changed) {
          this.save(false); // Update localStorage, skip server POST
          // Silently refresh the modal cards if template store is currently open
          const modal = document.getElementById('aether-template-store-modal');
          if (modal) this.renderTemplateCards(modal, null);
        }
      } catch {}
    }, 1000);
  }

  getSeedTemplates() {
    return [
      {
        id: 'legal_conference_summit',
        name: 'MCLE National Convention & Summit',
        category: 'Legal & Summit',
        thumbnail: 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&w=800&q=80',
        description: 'Comprehensive legal conference portal featuring keynote banners, seminar syllabus store, delegate booking calendar, and real-time FAQ accordion.',
        price: 0,
        requiredAddons: [
          'addon_ecommerce_grid',
          'addon_interactive_faq_accordion',
          'addon_appointment_calendar'
        ],
        sections: [] // Populated when loaded or seeded
      },
      {
        id: 'ecommerce_law_store',
        name: 'Legal Bookstore & MCLE Modules Store',
        category: 'E-Commerce',
        thumbnail: 'https://images.unsplash.com/photo-1589829545856-d10d557cf95f?auto=format&fit=crop&w=800&q=80',
        description: 'Clean, high-converting product storefront layout featuring shopping cart drawer, merchandise badges, and instant checkout trigger.',
        price: 0,
        requiredAddons: ['addon_ecommerce_grid'],
        sections: []
      },
      {
        id: 'admin_mcle_portal',
        name: 'Faculty Access & Argon2 Login Portal',
        category: 'Security & Portal',
        thumbnail: 'https://images.unsplash.com/photo-1563986768609-322da13575f3?auto=format&fit=crop&w=800&q=80',
        description: 'Secure portal landing page integrated with WebAssembly Argon2id cryptographic password authentication.',
        price: 0,
        requiredAddons: ['addon_admin_login_gate'],
        sections: []
      },
      {
        id: 'legal_podcast_briefing',
        name: 'Legal Insights Audio & Lecture Bar',
        category: 'Media & Audio',
        thumbnail: 'https://images.unsplash.com/photo-1590602847861-f357a9332bbc?auto=format&fit=crop&w=800&q=80',
        description: 'Broadcast lecture episodes and jurisprudence audio briefings with streaming player and speaker credentials.',
        price: 0,
        requiredAddons: ['addon_audio_podcast_player'],
        sections: []
      },
      {
        id: 'consultation_booking_hub',
        name: 'Consultation & Seminar Booking Hub',
        category: 'Booking & Schedule',
        thumbnail: 'https://images.unsplash.com/photo-1450133064473-71024230f91b?auto=format&fit=crop&w=800&q=80',
        description: 'Interactive appointment calendar with slot picker, morning/afternoon schedules, and searchable FAQ accordions.',
        price: 0,
        requiredAddons: ['addon_appointment_calendar', 'addon_interactive_faq_accordion'],
        sections: []
      },
      {
        id: 'saas',
        name: 'SaaS Launchpad Pro',
        category: 'Startup & Tech',
        thumbnail: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=600&q=80',
        description: 'High-converting technology landing page with animated stats, feature carousel, and pricing table.',
        price: 0,
        requiredAddons: [],
        sections: (TEMPLATES.saas && TEMPLATES.saas.sections) ? TEMPLATES.saas.sections : []
      },
      {
        id: 'portfolio',
        name: 'Creative Studio & Portfolio',
        category: 'Portfolio',
        thumbnail: 'https://images.unsplash.com/photo-1507238691740-187a5b1d37b8?auto=format&fit=crop&w=600&q=80',
        description: 'Sleek dark portfolio featuring visual gallery, interactive lightbox, and animated credentials.',
        price: 0,
        requiredAddons: [],
        sections: (TEMPLATES.portfolio && TEMPLATES.portfolio.sections) ? TEMPLATES.portfolio.sections : []
      }
    ];
  }

  /**
   * Scans an array of sections and automatically returns an array of unique addon IDs.
   */
  detectRequiredAddons(sections = []) {
    const required = new Set();
    sections.forEach(s => {
      const wType = s.widgetType || '';
      if (wType.startsWith('addon_')) {
        required.add(wType);
      } else {
        const wDef = WIDGET_REGISTRY[wType];
        if (wDef && wDef.isAddon && wDef.addonId) {
          required.add(wDef.addonId);
        }
      }
    });
    return Array.from(required);
  }

  /**
   * Resolves detailed info for each required addon (name, icon, installation status).
   */
  getRequiredAddonsDetails(addonIds = []) {
    const installedIds = (addonManager.addons || []).map(a => a.id);
    const catalog = addonStore.catalog || [];

    return addonIds.map(id => {
      const catalogItem = catalog.find(c => c.id === id);
      const isInstalled = installedIds.includes(id);
      return {
        id: id,
        name: catalogItem ? catalogItem.name : (id.replace(/^addon_/, '').replace(/_/g, ' ')),
        icon: catalogItem ? catalogItem.icon : '🧩',
        isInstalled: isInstalled,
        isFree: catalogItem ? catalogItem.price === 0 : true,
        priceLabel: catalogItem ? catalogItem.priceLabel : 'FREE',
        catalogItem: catalogItem
      };
    });
  }

  async save(syncServer = true) {
    try {
      localStorage.setItem('aether_template_store', JSON.stringify(this.templates));
    } catch {}

    if (syncServer) {
      try {
        const apiBase = (typeof window._aetherApiBase !== 'undefined') ? window._aetherApiBase : 'api.php';
        await fetch(`${apiBase}?action=save_templates`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(this.templates)
        });
      } catch {}
    }
  }

  addTemplate(tmpl) {
    if (!tmpl.id) tmpl.id = 'tmpl_' + Date.now();
    if (!tmpl.requiredAddons) tmpl.requiredAddons = this.detectRequiredAddons(tmpl.sections || []);
    tmpl.price = 0; // Guaranteed free
    this.templates.unshift(tmpl);
    this.save(true);
    return tmpl;
  }

  updateTemplate(id, updatedFields) {
    const idx = this.templates.findIndex(t => t.id === id);
    if (idx !== -1) {
      this.templates[idx] = { ...this.templates[idx], ...updatedFields };
      if (updatedFields.sections) {
        this.templates[idx].requiredAddons = this.detectRequiredAddons(updatedFields.sections);
      }
      this.save(true);
      return this.templates[idx];
    }
    return null;
  }

  deleteTemplate(id) {
    this.templates = this.templates.filter(t => t.id !== id);
    this.save(true);
  }

  /**
   * Loads template sections into state with auto-installation of required add-ons.
   */
  async applyTemplate(templateId, options = {}) {
    let tmpl = this.templates.find(t => t.id === templateId);
    if (!tmpl && TEMPLATES[templateId]) {
      tmpl = TEMPLATES[templateId];
    }
    if (!tmpl) throw new Error('Template not found.');

    // Auto-install missing required add-ons if requested
    const requiredDetails = this.getRequiredAddonsDetails(tmpl.requiredAddons || []);
    const missing = requiredDetails.filter(d => !d.isInstalled);

    if (missing.length > 0 && options.autoInstall !== false) {
      for (const item of missing) {
        if (item.catalogItem) {
          try {
            addonManager.installAddon(item.catalogItem);
          } catch (e) {
            console.warn(`[TemplateStore] Auto-install failed for ${item.id}:`, e);
          }
        }
      }
    }

    // Apply sections to canvas/state
    if (tmpl.sections && tmpl.sections.length > 0) {
      state.loadSections(JSON.parse(JSON.stringify(tmpl.sections)));
    } else if (TEMPLATES[tmpl.id] && TEMPLATES[tmpl.id].sections) {
      state.loadSections(JSON.parse(JSON.stringify(TEMPLATES[tmpl.id].sections)));
    }

    if (window.aetherApp && window.aetherApp.canvas) {
      window.aetherApp.canvas.render();
      window.aetherApp.canvas.showToast(`✨ Template "${tmpl.name}" successfully loaded!`, 'success');
    }

    return { success: true, installedAddons: missing.map(m => m.name) };
  }

  ensureStoreStyles() {
    if (document.getElementById('aether-template-store-styles')) return;
    const style = document.createElement('style');
    style.id = 'aether-template-store-styles';
    style.textContent = `
      @keyframes templateStoreIn {
        from { opacity: 0; transform: scale(0.96) translateY(12px); }
        to { opacity: 1; transform: scale(1) translateY(0); }
      }
      #tmpl-cards-container {
        display: grid !important;
        grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)) !important;
        gap: 20px !important;
        align-content: start !important;
        scrollbar-width: thin;
        scrollbar-color: #10b981 rgba(15, 23, 42, 0.6);
      }
      #tmpl-cards-container::-webkit-scrollbar {
        width: 8px;
      }
      #tmpl-cards-container::-webkit-scrollbar-track {
        background: rgba(15, 23, 42, 0.6);
        border-radius: 8px;
        margin: 6px 0;
      }
      #tmpl-cards-container::-webkit-scrollbar-thumb {
        background: linear-gradient(180deg, #10b981, #059669);
        border-radius: 8px;
        border: 2px solid rgba(15, 23, 42, 0.6);
      }
      #tmpl-cards-container::-webkit-scrollbar-thumb:hover {
        background: #34d399;
      }
      .template-item-card {
        background: rgba(19, 27, 46, 0.88);
        border: 1px solid rgba(255, 255, 255, 0.09);
        border-radius: 16px;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        min-height: 520px;
        box-sizing: border-box;
        transition: transform 0.22s cubic-bezier(0.16, 1, 0.3, 1), border-color 0.22s ease, box-shadow 0.22s ease;
        position: relative;
      }
      .tmpl-required-addons-list {
        display: flex;
        flex-direction: column;
        gap: 6px;
        max-height: 160px;
        overflow-y: auto;
        scrollbar-width: thin;
        scrollbar-color: rgba(99, 102, 241, 0.45) transparent;
        padding-right: 2px;
      }
      .tmpl-required-addons-list::-webkit-scrollbar {
        width: 5px;
      }
      .tmpl-required-addons-list::-webkit-scrollbar-track {
        background: rgba(15, 23, 42, 0.3);
        border-radius: 4px;
      }
      .tmpl-required-addons-list::-webkit-scrollbar-thumb {
        background: rgba(99, 102, 241, 0.4);
        border-radius: 4px;
      }
      .tmpl-required-addons-list::-webkit-scrollbar-thumb:hover {
        background: rgba(99, 102, 241, 0.7);
      }
      .template-item-card:hover {
        transform: translateY(-4px);
        border-color: rgba(16, 185, 129, 0.5) !important;
        box-shadow: 0 20px 35px -10px rgba(0, 0, 0, 0.7), 0 0 25px rgba(16, 185, 129, 0.16) !important;
      }
      .template-filter-pill {
        padding: 6px 14px;
        border-radius: 20px;
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.1);
        color: #94a3b8;
        font-size: 0.78rem;
        font-weight: 600;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        gap: 7px;
        transition: all 0.2s ease;
        font-family: inherit;
        user-select: none;
      }
      .template-filter-pill:hover {
        background: rgba(255, 255, 255, 0.09);
        color: #ffffff;
        border-color: rgba(255, 255, 255, 0.18);
      }
      .template-filter-pill.active {
        background: rgba(16, 185, 129, 0.16) !important;
        border-color: rgba(16, 185, 129, 0.5) !important;
        color: #6ee7b7 !important;
        font-weight: 700;
        box-shadow: 0 0 14px rgba(16, 185, 129, 0.15);
      }
      .template-card-thumb {
        height: 175px;
        min-height: 175px;
        max-height: 175px;
        width: 100%;
        flex-shrink: 0;
        position: relative;
        overflow: hidden;
        background: #0b1120;
      }
      .btn-load-template {
        background: linear-gradient(135deg, #10b981 0%, #059669 100%);
        color: #ffffff;
        font-weight: 700;
        font-size: 0.84rem;
        border: none;
        padding: 11px 16px;
        border-radius: 10px;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        width: 100%;
        box-shadow: 0 4px 14px rgba(16, 185, 129, 0.32);
        transition: all 0.2s ease;
      }
      .btn-load-template:hover {
        filter: brightness(1.12);
        transform: translateY(-1px);
        box-shadow: 0 6px 20px rgba(16, 185, 129, 0.45);
      }
      .btn-load-template:active {
        transform: translateY(0);
      }
    `;
    document.head.appendChild(style);
  }

  getTemplateCoverSvg(item) {
    const cat = item.category || '';
    let accent = '#10b981';
    let bgGrad1 = '#061a23';
    let bgGrad2 = '#0d3238';
    let iconSvg = '<path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="M7 21h10"/><path d="M12 3v18"/><path d="M3 7h18"/>';

    if (cat.includes('Legal') || cat.includes('Summit')) {
      accent = '#10b981';
      bgGrad1 = '#051b24';
      bgGrad2 = '#0d3238';
      iconSvg = '<path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="M7 21h10"/><path d="M12 3v18"/><path d="M3 7h18"/>';
    } else if (cat.includes('Commerce')) {
      accent = '#6366f1';
      bgGrad1 = '#0d132b';
      bgGrad2 = '#1a1f4a';
      iconSvg = '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/>';
    } else if (cat.includes('Security') || cat.includes('Portal')) {
      accent = '#a855f7';
      bgGrad1 = '#150f28';
      bgGrad2 = '#291b4a';
      iconSvg = '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>';
    } else if (cat.includes('Media') || cat.includes('Audio')) {
      accent = '#ec4899';
      bgGrad1 = '#240f22';
      bgGrad2 = '#44193b';
      iconSvg = '<path d="M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 18 0v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3"/>';
    } else if (cat.includes('Booking') || cat.includes('Schedule')) {
      accent = '#f59e0b';
      bgGrad1 = '#241a08';
      bgGrad2 = '#422c0d';
      iconSvg = '<rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/><path d="M8 2v4"/><path d="M16 2v4"/>';
    } else if (cat.includes('Startup') || cat.includes('Tech')) {
      accent = '#06b6d4';
      bgGrad1 = '#081c2b';
      bgGrad2 = '#0d364f';
      iconSvg = '<path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/>';
    } else {
      accent = '#8b5cf6';
      bgGrad1 = '#120f2b';
      bgGrad2 = '#231d4d';
      iconSvg = '<rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>';
    }

    const safeId = (item.id || 'tmpl').replace(/[^a-zA-Z0-9_-]/g, '_');

    return `<svg width="100%" height="100%" viewBox="0 0 400 200" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="g_${safeId}" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="${bgGrad1}"/>
          <stop offset="100%" stop-color="${bgGrad2}"/>
        </linearGradient>
      </defs>
      <rect width="400" height="200" fill="url(#g_${safeId})"/>
      <rect x="22" y="22" width="356" height="156" rx="10" fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>
      <rect x="36" y="36" width="90" height="8" rx="4" fill="${accent}" opacity="0.85"/>
      <rect x="36" y="54" width="180" height="14" rx="4" fill="#ffffff" opacity="0.88"/>
      <rect x="36" y="76" width="220" height="7" rx="3" fill="#94a3b8" opacity="0.6"/>
      <rect x="36" y="88" width="170" height="7" rx="3" fill="#94a3b8" opacity="0.4"/>
      <rect x="36" y="112" width="80" height="26" rx="6" fill="${accent}" opacity="0.9"/>
      <g transform="translate(290, 75)" stroke="${accent}" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round" opacity="0.45">
        <rect x="-24" y="-24" width="68" height="68" rx="14" fill="rgba(255,255,255,0.04)" stroke="${accent}" stroke-opacity="0.3"/>
        ${iconSvg}
      </g>
    </svg>`;
  }

  /**
   * Opens the User-Facing Free Template Store Modal
   */
  openStoreModal(onLoadCallback) {
    this.ensureStoreStyles();

    let modal = document.getElementById('aether-template-store-modal');
    if (modal) modal.remove();

    modal = document.createElement('div');
    modal.id = 'aether-template-store-modal';
    modal.className = 'aether-modal-overlay';
    modal.style.cssText = `
      position: fixed; inset: 0; z-index: 10001;
      background: rgba(4, 7, 16, 0.88); backdrop-filter: blur(14px);
      display: flex; align-items: center; justify-content: center;
      padding: 20px; font-family: 'Inter', system-ui, sans-serif;
    `;

    modal.innerHTML = `
      <div class="template-store-modal-container" style="
        width: 100%; max-width: 1140px; height: min(88vh, 840px); min-height: 520px;
        background: #0b0f19; border: 1px solid rgba(255,255,255,0.12);
        border-radius: 18px; display: flex; flex-direction: column;
        box-shadow: 0 25px 60px -15px rgba(0,0,0,0.85), 0 0 35px rgba(16,185,129,0.18);
        overflow: hidden; animation: templateStoreIn 0.22s ease-out; position: relative;
      ">
        <!-- 1. Header -->
        <div style="padding: 18px 24px; border-bottom: 1px solid rgba(255,255,255,0.08); display: flex; align-items: center; justify-content: space-between; background: rgba(15,23,42,0.6); flex-shrink: 0;">
          <div style="display: flex; align-items: center; gap: 14px;">
            <div style="width: 44px; height: 44px; border-radius: 12px; background: linear-gradient(135deg,#10b981,#059669); display: flex; align-items: center; justify-content: center; box-shadow: 0 8px 18px rgba(16,185,129,0.35); flex-shrink: 0;">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/>
              </svg>
            </div>
            <div>
              <div style="display:flex;align-items:center;gap:8px;">
                <h2 style="margin: 0; font-size: 1.25rem; font-weight: 800; color: #ffffff;">Free Template Store</h2>
                <span style="font-size: 0.68rem; font-weight: 800; background: rgba(16,185,129,0.2); color: #6ee7b7; padding: 2px 8px; border-radius: 10px; border: 1px solid rgba(16,185,129,0.4);">100% Free Library</span>
              </div>
              <p style="margin: 3px 0 0 0; font-size: 0.8rem; color: #94a3b8;">Pre-built full-page templates with automatic required add-on detection &amp; 1-click loading.</p>
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 10px;">
            <input type="file" id="input-theme-bundle-file" accept=".zip" style="display: none;" />
            <button type="button" id="btn-install-theme-bundle" style="background: rgba(16,185,129,0.14); border: 1px solid rgba(16,185,129,0.38); color: #6ee7b7; padding: 8px 14px; border-radius: 9px; font-size: 0.8rem; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 7px; transition: all 0.2s;" title="Install custom theme bundle (.zip) with partner add-ons">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>
              </svg>
              <span>Install Theme (.zip)</span>
            </button>
            <button type="button" id="btn-close-template-modal" style="background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.14); color: #ffffff; width: 34px; height: 34px; border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 1rem; transition: all 0.2s;" title="Close Library">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M18 6 6 18M6 6l12 12"/>
              </svg>
            </button>
          </div>
        </div>

        <!-- 2. Categories & Search Toolbar -->
        <div style="padding: 12px 24px; background: rgba(15,23,42,0.4); border-bottom: 1px solid rgba(255,255,255,0.06); display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; flex-shrink: 0;">
          <div style="display: flex; gap: 6px; flex-wrap: wrap;" id="tmpl-category-tabs">
            <button type="button" class="template-filter-pill store-filter-pill active" data-filter="all">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/></svg>
              <span>All (${this.templates.length})</span>
            </button>
            <button type="button" class="template-filter-pill store-filter-pill" data-filter="Legal & Summit">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="M7 21h10"/><path d="M12 3v18"/><path d="M3 7h18"/></svg>
              <span>Legal &amp; Summit</span>
            </button>
            <button type="button" class="template-filter-pill store-filter-pill" data-filter="E-Commerce">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
              <span>E-Commerce</span>
            </button>
            <button type="button" class="template-filter-pill store-filter-pill" data-filter="Booking & Schedule">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/><path d="M8 2v4"/><path d="M16 2v4"/></svg>
              <span>Booking</span>
            </button>
            <button type="button" class="template-filter-pill store-filter-pill" data-filter="Security & Portal">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/></svg>
              <span>Portals</span>
            </button>
            <button type="button" class="template-filter-pill store-filter-pill" data-filter="Media & Audio">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 18 0v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3"/></svg>
              <span>Media</span>
            </button>
          </div>

          <div style="position: relative; min-width: 200px; max-width: 260px; flex: 1;">
            <svg style="position: absolute; left: 11px; top: 9px; pointer-events: none; color: #94a3b8;" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
            <input type="text" id="tmpl-search-input" placeholder="Search templates..." style="width: 100%; padding: 7px 12px 7px 32px; background: rgba(15,23,42,0.8); border: 1px solid rgba(255,255,255,0.15); border-radius: 20px; color: #ffffff; font-size: 0.8rem; outline: none; transition: border-color 0.2s;" />
          </div>
        </div>

        <!-- 3. Templates Grid -->
        <div id="tmpl-cards-container" style="flex: 1; overflow-y: auto; overflow-x: hidden; padding: 22px 24px 32px 24px; align-content: start;">
          <!-- Dynamically populated -->
        </div>

        <!-- Bottom scroll soft shadow -->
        <div style="height: 16px; margin-top: -16px; background: linear-gradient(to bottom, transparent, rgba(15,23,42,0.92)); pointer-events: none; z-index: 4; flex-shrink: 0;"></div>

        <!-- 4. Footer Tip -->
        <div style="padding: 12px 24px; background: rgba(15,23,42,0.95); border-top: 1px solid rgba(255,255,255,0.08); display: flex; align-items: center; justify-content: space-between; font-size: 0.76rem; color: #94a3b8; flex-shrink: 0;">
          <div style="display: flex; align-items: center; gap: 6px;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
            <span><strong>All Templates Free:</strong> Loading a template automatically verifies and prompts for any required add-ons.</span>
          </div>
          <div style="color: #64748b; font-size: 0.72rem;">Scroll for more templates ↕</div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    modal.querySelector('#btn-close-template-modal').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

    // 📦 1-Click Theme Bundle (.zip) Installer
    const bundleInput = modal.querySelector('#input-theme-bundle-file');
    const bundleBtn = modal.querySelector('#btn-install-theme-bundle');

    if (bundleBtn && bundleInput) {
      bundleBtn.addEventListener('click', () => {
        bundleInput.value = '';
        bundleInput.click();
      });

      bundleInput.addEventListener('change', async (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;

        if (!file.name.toLowerCase().endsWith('.zip')) {
          alert('Please select a valid .zip theme bundle.');
          return;
        }

        const origHtml = bundleBtn.innerHTML;
        bundleBtn.disabled = true;
        bundleBtn.innerHTML = `<span>⏳</span><span>Installing...</span>`;

        try {
          const formData = new FormData();
          formData.append('theme_zip', file);

          const apiBase = (typeof window._aetherApiBase !== 'undefined') ? window._aetherApiBase : 'api.php';
          const token = sessionStorage.getItem('aether_admin_token') || '';

          const res = await fetch(`${apiBase}?action=install_theme_bundle`, {
            method: 'POST',
            headers: { 'X-Admin-Token': token },
            body: formData
          });

          const data = await res.json();
          if (!res.ok || !data.success) {
            throw new Error(data.error || 'Failed to install theme bundle.');
          }

          // 1. Refresh addons in manager
          try {
            addonManager.isInitialized = false;
            await addonManager.init();
          } catch (ae) {
            console.warn('[TemplateStore] Addon reload notice:', ae);
          }

          // 2. Fetch fresh templates from server
          try {
            const tRes = await fetch(`${apiBase}?action=get_templates&_t=${Date.now()}`);
            if (tRes.ok) {
              const tData = await tRes.json();
              if (Array.isArray(tData) && tData.length > 0) {
                this.templates = tData;
                this.save(false);
              }
            }
          } catch (_) {
            if (data.theme) {
              this.templates.unshift(data.theme);
            }
          }

          // 3. Update category pill count
          const allPill = modal.querySelector('.template-filter-pill[data-filter="all"], .store-filter-pill[data-filter="all"]');
          if (allPill) {
            allPill.innerHTML = `
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/></svg>
              <span>All (${this.templates.length})</span>
            `;
          }

          // 4. Re-render cards
          this.renderTemplateCards(modal, onLoadCallback);

          const theme = data.theme;
          const addonCount = (data.addons_installed || []).length;
          const addonDetail = addonCount > 0 ? ` + ${addonCount} partner add-on(s)` : '';

          if (window.aetherApp && window.aetherApp.canvas) {
            window.aetherApp.canvas.showToast(`✨ Installed: ${theme ? theme.name : 'Theme Bundle'}${addonDetail}!`, 'success');
          }

          // 5. Offer 1-click apply to active canvas
          if (theme && confirm(`🎉 Theme "${theme.name}" installed successfully${addonCount > 0 ? ` along with ${addonCount} partner add-on(s):\n• ` + data.addons_installed.join('\n• ') : ''}!\n\nWould you like to load and apply this theme to your active canvas now?`)) {
            await this.applyTemplate(theme.id, { autoInstall: true });
            modal.remove();
            if (typeof onLoadCallback === 'function') onLoadCallback(theme);
          }

        } catch (err) {
          alert('❌ Theme bundle installation error: ' + (err.message || err));
        } finally {
          bundleBtn.disabled = false;
          bundleBtn.innerHTML = origHtml;
          bundleInput.value = '';
        }
      });
    }

    // Category Tabs
    modal.querySelectorAll('.template-filter-pill, .store-filter-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        modal.querySelectorAll('.template-filter-pill, .store-filter-pill').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.activeFilter = btn.dataset.filter;
        this.renderTemplateCards(modal, onLoadCallback);
      });
    });

    // Search
    const searchInput = modal.querySelector('#tmpl-search-input');
    searchInput.addEventListener('input', (e) => {
      this.searchQuery = (e.target.value || '').toLowerCase().trim();
      this.renderTemplateCards(modal, onLoadCallback);
    });

    this.renderTemplateCards(modal, onLoadCallback);
  }

  renderTemplateCards(modal, onLoadCallback) {
    const container = modal.querySelector('#tmpl-cards-container');
    if (!container) return;

    let items = this.templates.filter(item => {
      if (this.activeFilter !== 'all' && item.category !== this.activeFilter) return false;
      if (this.searchQuery) {
        const matchName = (item.name || '').toLowerCase().includes(this.searchQuery);
        const matchDesc = (item.description || '').toLowerCase().includes(this.searchQuery);
        const matchCat  = (item.category || '').toLowerCase().includes(this.searchQuery);
        return matchName || matchDesc || matchCat;
      }
      return true;
    });

    if (items.length === 0) {
      container.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 60px 20px; color: #94a3b8;">
          <div style="font-size: 2.5rem; margin-bottom: 12px;">🔍</div>
          <div style="font-size: 1.1rem; font-weight: 700; color: #ffffff; margin-bottom: 4px;">No Templates Found</div>
          <div>Try clearing your search terms or category filter.</div>
        </div>
      `;
      return;
    }

    container.innerHTML = items.map(item => {
      const required = this.getRequiredAddonsDetails(item.requiredAddons || []);
      const missingCount = required.filter(r => !r.isInstalled).length;

      return `
        <div class="template-item-card" data-tmpl-id="${item.id}">
          <!-- 1. Card Cover Thumbnail with Guaranteed Vector Fallback -->
          <div class="template-card-thumb">
            <div class="tmpl-svg-cover" style="position: absolute; inset: 0; display: flex; width: 100%; height: 100%;">
              ${this.getTemplateCoverSvg(item)}
            </div>
            ${item.thumbnail ? `
              <img src="${item.thumbnail}" alt="${item.name}"
                   style="position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; opacity: 1; transition: opacity 0.3s;"
                   loading="lazy"
                   onerror="this.style.display='none';" />
            ` : ''}
            <!-- Floating Badges -->
            <div style="position: absolute; top: 10px; right: 10px; display: flex; gap: 6px; z-index: 2;">
              <span style="font-size: 0.68rem; font-weight: 800; background: rgba(16,185,129,0.92); color: #fff; padding: 3px 8px; border-radius: 12px; text-transform: uppercase; letter-spacing: 0.04em; box-shadow: 0 2px 6px rgba(0,0,0,0.4);">100% Free</span>
              <span style="font-size: 0.68rem; font-weight: 700; background: rgba(15,23,42,0.88); backdrop-filter: blur(8px); color: #cbd5e1; padding: 3px 8px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.14);">${item.category}</span>
            </div>
          </div>

          <!-- 2. Card Body Info -->
          <div style="padding: 16px 18px; flex: 1 1 auto; display: flex; flex-direction: column; min-height: 0;">
            <div style="font-weight: 800; font-size: 1rem; color: #ffffff; line-height: 1.35; margin-bottom: 6px;">
              ${item.name}
            </div>
            <div style="font-size: 0.79rem; color: #94a3b8; line-height: 1.4; margin-bottom: 12px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; min-height: 2.2em;" title="${item.description || ''}">
              ${item.description || ''}
            </div>

            <!-- 3. Required Add-ons Dependencies Box -->
            <div style="margin-top: auto; padding: 10px 12px; background: rgba(15, 23, 42, 0.75); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 10px;">
              <div style="font-size: 0.70rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.06em; color: #cbd5e1; margin-bottom: 8px; display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap;">
                <span style="display: flex; align-items: center; gap: 5px;">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v20M2 12h20"/></svg>
                  <span>Required Add-ons (${required.length}):</span>
                </span>
                ${missingCount === 0 
                  ? `<span style="color:#10b981;font-weight:700;display:inline-flex;align-items:center;gap:4px;"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg> Ready</span>` 
                  : `<div style="display:flex;align-items:center;gap:6px;">
                      <span style="color:#f59e0b;font-weight:700;display:inline-flex;align-items:center;gap:4px;"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> ${missingCount} to install</span>
                      ${missingCount > 1 ? `<button type="button" class="btn-install-all-addons" data-tmpl-id="${item.id}" style="background: rgba(99,102,241,0.25); border: 1px solid rgba(99,102,241,0.6); color: #c7d2fe; border-radius: 4px; padding: 1px 6px; font-size: 0.65rem; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 3px;" title="Install all ${missingCount} missing add-ons">⚡ Install All</button>` : ''}
                    </div>`}
              </div>
              ${required.length > 0 ? `
                <div class="tmpl-required-addons-list">
                  ${required.map(r => `
                    <div style="display: flex; align-items: center; justify-content: space-between; font-size: 0.72rem; padding: 4px 8px; border-radius: 6px; background: ${r.isInstalled ? 'rgba(16,185,129,0.08)' : 'rgba(245,158,11,0.08)'}; border: 1px solid ${r.isInstalled ? 'rgba(16,185,129,0.22)' : 'rgba(245,158,11,0.28)'}; min-height: 28px; box-sizing: border-box;">
                      <span style="display: flex; align-items: center; gap: 6px; color: #ffffff; min-width: 0;">
                        <span>${r.icon || '🧩'}</span>
                        <span style="font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${r.name}</span>
                      </span>
                      ${r.isInstalled ? `
                        <span style="color: #6ee7b7; font-weight: 700; font-size: 0.68rem; flex-shrink: 0; display: inline-flex; align-items: center; gap: 3px;">
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
                          Installed
                        </span>
                      ` : `
                        <button type="button" class="btn-quick-install-addon" data-addon-id="${r.id}" style="background: #6366f1; color: #fff; border: none; border-radius: 5px; padding: 2px 7px; font-size: 0.67rem; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; flex-shrink: 0; transition: background 0.15s;">
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                          Install
                        </button>
                      `}
                    </div>
                  `).join('')}
                </div>
              ` : `
                <div style="font-size: 0.72rem; color: #64748b;">No external add-ons required. Uses core elements.</div>
              `}
            </div>
          </div>

          <!-- 4. Pinned Bottom Action Button -->
          <div style="padding: 12px 18px 16px 18px; border-top: 1px solid rgba(255,255,255,0.07); background: rgba(11, 15, 25, 0.7); flex-shrink: 0;">
            <button type="button" class="btn-load-template" data-id="${item.id}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/></svg>
              <span>Load Template</span>
            </button>
          </div>
        </div>
      `;
    }).join('');

    // Attach Action Handlers
    // 1. Quick Install Single Addon
    container.querySelectorAll('.btn-quick-install-addon').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const addonId = e.currentTarget.dataset.addonId;
        const catalogItem = (addonStore.catalog || []).find(c => c.id === addonId);
        if (catalogItem) {
          try {
            addonManager.installAddon(catalogItem);
            this.renderTemplateCards(modal, onLoadCallback);
            if (window.aetherApp && window.aetherApp.canvas) {
              window.aetherApp.canvas.showToast(`✅ Installed "${catalogItem.name}"`, 'success');
            }
          } catch (err) {
            alert('Failed to install add-on: ' + err.message);
          }
        }
      });
    });

    // 1b. Install All Missing Add-ons for a Template in 1 Click
    container.querySelectorAll('.btn-install-all-addons').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const tmplId = e.currentTarget.dataset.tmplId;
        const tmpl = this.templates.find(t => t.id === tmplId);
        if (!tmpl) return;

        const required = this.getRequiredAddonsDetails(tmpl.requiredAddons || []);
        const missing = required.filter(r => !r.isInstalled);
        let installedCount = 0;

        missing.forEach(m => {
          const catalogItem = (addonStore.catalog || []).find(c => c.id === m.id);
          if (catalogItem) {
            try {
              addonManager.installAddon(catalogItem);
              installedCount++;
            } catch (err) {
              console.warn('[TemplateStore] Failed to install addon:', m.id, err);
            }
          }
        });

        this.renderTemplateCards(modal, onLoadCallback);
        if (window.aetherApp?.canvas) {
          window.aetherApp.canvas.showToast(`✅ Installed ${installedCount} required add-ons!`, 'success');
        }
      });
    });

    // 2. Load Template
    container.querySelectorAll('.btn-load-template').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const id = e.currentTarget.dataset.id;
        const tmpl = this.templates.find(t => t.id === id);
        if (!tmpl) return;

        const required = this.getRequiredAddonsDetails(tmpl.requiredAddons || []);
        const missing = required.filter(r => !r.isInstalled);

        if (missing.length > 0) {
          const missingNames = missing.map(m => m.name).join(', ');
          const ok = confirm(`⚠️ Required Add-ons Notice:\n\n"${tmpl.name}" uses the following add-on(s) to render all its contents:\n- ${missingNames}\n\nWould you like AetherBuilder to automatically install the missing add-on(s) now so the page displays completely?`);
          if (ok) {
            btn.disabled = true;
            btn.innerHTML = `<span>⏳</span><span>Installing add-ons &amp; loading...</span>`;
            await this.applyTemplate(id, { autoInstall: true });
            modal.remove();
            if (typeof onLoadCallback === 'function') onLoadCallback(tmpl);
            return;
          }
        }

        if (confirm(`Load "${tmpl.name}" into current canvas? (You can undo with Ctrl+Z)`)) {
          btn.disabled = true;
          btn.innerHTML = `<span>⏳</span><span>Loading template...</span>`;
          await this.applyTemplate(id, { autoInstall: true });
          modal.remove();
          if (typeof onLoadCallback === 'function') onLoadCallback(tmpl);
        }
      });
    });
  }
}

export const templateStore = new TemplateStore();
