/**
 * AETHERBUILDER - CENTRAL REACTIVE STATE STORE (Multi-Page Edition)
 * Manages virtual page tree, multi-page support, undo/redo history, and local persistence.
 */

import { TEMPLATES } from './templates.js';
import { WIDGET_REGISTRY } from './widgets.js';
import { applyTheme } from './themes.js';

const STORAGE_KEY_DRAFT  = 'aether_builder_draft_v2';
const STORAGE_KEY_PUBLIC = 'aether_public_site_v2';

function makePageId() {
  return `pg_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
}

function makeDefaultPage(id, slug, title, sections = []) {
  return {
    id:   id   || makePageId(),
    slug: slug || 'home',
    title: title || 'Home',
    sections: sections,
    pageSettings: {
      pageTitle:   title || 'Home',
      themePreset: 'dark-neon',
      fontFamily:  "'Plus Jakarta Sans', sans-serif"
    }
  };
}

// Recursive UTF-8 Mojibake Sanitizer & Repair Engine
export function sanitizeText(val) {
  if (typeof val !== 'string') return val;
  let out = val;
  // 2-byte sequences (C2 xx) misread as Latin-1 (Windows-1252)
  out = out.split('\u00C2\u00A9').join('\u00A9');   // Â© -> ©
  out = out.split('\u00C2\u00AE').join('\u00AE');   // Â® -> ®
  out = out.split('\u00C2\u00B7').join('\u00B7');   // Â· -> ·
  // 3-byte sequences (E2 xx xx) misread as Latin-1
  out = out.split('\u00E2\u0080\u00A2').join('\u2022'); // â€¢ -> bullet
  out = out.split('\u00E2\u0080\u0093').join('\u2013'); // â€" -> en dash
  out = out.split('\u00E2\u0080\u0099').join('\u2019'); // â€™ -> rsquote
  out = out.split('\u00E2\u0080\u009C').join('\u201C'); // â€œ -> ldquote
  out = out.split('\u00E2\u0080\u009D').join('\u201D'); // â€  -> rdquote
  out = out.split('\u00E2\u009C\u0093').join('\u2713'); // âœ" -> checkmark
  out = out.split('\u00E2\u009C\u00A8').join('\u2728'); // âœ¨ -> sparkles
  out = out.split('\u00E2\u0086\u0092').join('\u2192'); // â†' -> right arrow
  out = out.split('\u00E2\u0086\u0091').join('\u2191'); // â†' -> up arrow
  out = out.split('\u00E2\u0086\u0093').join('\u2193'); // â†" -> down arrow
  out = out.split('\u00E2\u0096\u00B6').join('\u25B6'); // â–¶ -> play triangle
  out = out.split('\u00E2\u0096\u00B8').join('\u25B8'); // â–¸ -> small play
  out = out.split('\u00E2\u0096\u00BE').join('\u25BE'); // â—¾ -> down triangle
  out = out.split('\u00E2\u00AC\u0087').join('\u2B07'); // â¬‡ -> down arrow box
  out = out.split('\u00E2\u00AD\u0090').join('\u2B50'); // â­  -> star
  out = out.split('\u00E2\u009A\u00A1').join('\u26A1'); // âš¡ -> lightning
  out = out.split('\u00E2\u009C\u0089').join('\u2709'); // âœ‰ -> envelope
  // Philippine Peso sign (U+20B1, UTF-8: E2 82 B1) misread as Latin-1
  out = out.split('\u00E2\u0082\u00B1').join('\u20B1'); // â‚± -> ₱
  // 4-byte emoji (F0 9F xx xx) misread as Latin-1
  out = out.split('\u00C3\u00B0\u0178\u0161\u201A\u20AC').join('\uD83D\uDE80'); // 🚀
  out = out.split('\u00C3\u00B0\u0178\u201D\u20AC').join('\uD83D\uDD10');       // 🔐
  out = out.split('\u00C3\u00B0\u0178\u201D\u00B1').join('\uD83D\uDCF1');       // 📱
  out = out.split('\u00C3\u00B0\u0178\u2019\u00A4').join('\uD83D\uDC64');       // 👤
  out = out.split('\u00C3\u00B0\u0178\u2019\u00A5').join('\uD83D\uDC65');       // 👥
  out = out.split('\u00C3\u00B0\u0178\u2019\u017D').join('\uD83D\uDC8E');       // 💎
  out = out.split('\u00C3\u00B0\u0178\u201D\u008A').join('\uD83D\uDCCA');       // 📊
  out = out.split('\u00C3\u00B0\u0178\u201D\u201E').join('\uD83D\uDCC4');       // 📄
  out = out.split('\u00C3\u00B0\u0178\u017D\u00A0').join('\uD83C\uDFA0');       // 🎠
  out = out.split('\u00C3\u00B0\u0178\u008C').join('\uD83C\uDF0D');              // 🌍
  out = out.split('\u00C3\u00B0\u0178\u201D\u008A').join('\uD83D\uDCCA');       // 📊
  // Remove stray lone Â (must be last)
  out = out.split('\u00C2\u00A0').join(' ');          // Â NBSP -> space
  out = out.split('\u00C2').join('');                  // lone Â -> remove
  return out;
}

export function sanitizeObject(obj) {
  if (!obj) return obj;
  if (typeof obj === 'string') return sanitizeText(obj);
  if (Array.isArray(obj)) return obj.map(item => sanitizeObject(item));
  if (typeof obj === 'object') {
    const res = {};
    for (const [k, v] of Object.entries(obj)) {
      res[k] = sanitizeObject(v);
    }
    return res;
  }
  return obj;
}

class BuilderState {
  constructor() {
    // Multi-page store
    this.pages         = [];          // Array of page objects
    this.currentPageId = null;        // Which page is being edited
    this.siteSettings  = {
      siteName: '',
      faviconUrl: '',
      brandLogoUrl: '',
      gaId: '',
      metaPixelId: '',
      customCss: '',
      headerScripts: '',
      footerScripts: '',
      copyright: '',
      notificationEmail: '',
      globalBg: {
        enabled: false,
        imageUrl: '',
        size: 'cover',
        position: 'center center',
        attachment: 'fixed',
        repeat: 'no-repeat',
        overlayOpacity: 50
      },
      chatbot: {
        enabled: true,
        title: 'USPF MCLE Assistant',
        subtitle: 'Automated 24/7 Guidance & Inquiries',
        avatar: '⚖️',
        bubbleText: 'Need help? Ask us!'
      }
    };

    this.activeElementId = null;
    this.viewportMode    = 'desktop';
    this.undoStack       = [];
    this.redoStack       = [];
    this.maxHistory      = 30;
    this.listeners       = new Set();

    this.init();
  }

  // ── Convenience getters ────────────────────────────────────────────────────
  get currentPage() {
    return this.pages.find(p => p.id === this.currentPageId) || this.pages[0] || null;
  }

  /**
   * Returns sections for the editor view. If the current page lacks a navbar, a global navbar from another page
   * (with `globalHeader` not set to false) is injected at the front. This is primarily for UI convenience.
   */
  get sections() {
    if (!this.currentPage) return this._publicSections || [];
    const ps = this.currentPage.pageSettings || {};
    let currentSections = [...(this.currentPage.sections || [])];

    // Page-level header toggle
    if (ps.hideHeader) {
      currentSections = currentSections.filter(s => s.widgetType !== 'navbar');
    } else {
      const hasNavbar = currentSections.some(s => s.widgetType === 'navbar');
      if (!hasNavbar && Array.isArray(this.pages) && this.pages.length > 0) {
        for (const pg of this.pages) {
          if (pg.id === this.currentPageId) continue;
          const globalNav = (pg.sections || []).find(s => s.widgetType === 'navbar' && s.props?.globalHeader !== false);
          if (globalNav) {
            currentSections = [globalNav, ...currentSections];
            break;
          }
        }
      }
    }

    // Page-level footer toggle
    if (ps.hideFooter) {
      currentSections = currentSections.filter(s => s.widgetType !== 'footer');
    } else {
      const hasFooter = currentSections.some(s => s.widgetType === 'footer');
      if (!hasFooter && Array.isArray(this.pages) && this.pages.length > 0) {
        for (const pg of this.pages) {
          if (pg.id === this.currentPageId) continue;
          const globalFoot = (pg.sections || []).find(s => s.widgetType === 'footer' && s.props?.globalFooter === true);
          if (globalFoot) {
            currentSections = [...currentSections, globalFoot];
            break;
          }
        }
      }
    }
    return currentSections;
  }

  /**
   * Raw sections array stored on the current page (or public fallback). Mutations should use this to ensure
   * changes are persisted correctly.
   */
  get rawSections() {
    if (!this.currentPage) return this._publicSections || [];
    return this.currentPage.sections || [];
  }

  set sections(val) {
    if (this.currentPage) this.currentPage.sections = val;
    else this._publicSections = val;
  }

  get pageSettings() {
    return this.currentPage ? this.currentPage.pageSettings : {};
  }

  set pageSettings(val) {
    if (this.currentPage) this.currentPage.pageSettings = val;
  }

  async fetchSiteFromServer() {
    const ts = Date.now();
    try {
      const res = await fetch(`api.php?action=get_site&_t=${ts}`, { cache: 'no-store' });
      if (res.ok) {
        try {
          const raw = await res.json();
          if (raw && (raw.pages || raw.sections)) return sanitizeObject(raw);
        } catch {}
      }
    } catch {}
    try {
      const res2 = await fetch(`data/site.json?_t=${ts}`, { cache: 'no-store' });
      if (res2.ok) {
        const raw2 = await res2.json();
        if (raw2 && (raw2.pages || raw2.sections)) return sanitizeObject(raw2);
      }
    } catch {}

    // Check assets/uploads for uploaded template JSON files
    try {
      const res3 = await fetch(`api.php?action=list_assets&_t=${ts}`, { cache: 'no-store' });
      if (res3.ok) {
        const data3 = await res3.json();
        const jsonAssets = (data3.assets || []).filter(a => a.ext === 'json');
        if (jsonAssets.length > 0) {
          const latestJson = jsonAssets[0]; // Newest first
          const res4 = await fetch(`${latestJson.url}?_t=${ts}`, { cache: 'no-store' });
          if (res4.ok) {
            const raw4 = await res4.json();
            if (raw4 && (raw4.pages || raw4.sections)) return sanitizeObject(raw4);
          }
        }
      }
    } catch {}

    return null;
  }

  // ── Init ───────────────────────────────────────────────────────────────────
  async init() {
    const savedDraft = localStorage.getItem(STORAGE_KEY_DRAFT);
    if (savedDraft) {
      try {
        const parsed = sanitizeObject(JSON.parse(savedDraft));
        // Multi-page format
        if (Array.isArray(parsed.pages) && parsed.pages.length > 0) {
          this.pages         = parsed.pages;
          this.currentPageId = parsed.currentPageId || this.pages[0].id;
          if (parsed.siteSettings) this.siteSettings = { ...this.siteSettings, ...parsed.siteSettings };
          this.applyActiveTheme();
          return; // Has local draft – use it immediately, no server fetch needed
        }
        // Legacy single-page format — migrate
        if (Array.isArray(parsed.sections) && parsed.sections.length > 0) {
          const homePage = makeDefaultPage(makePageId(), 'index', 'Home', parsed.sections);
          if (parsed.pageSettings) homePage.pageSettings = { ...homePage.pageSettings, ...parsed.pageSettings };
          this.pages = [homePage];
          this.currentPageId = homePage.id;
          if (parsed.siteSettings) this.siteSettings = { ...this.siteSettings, ...parsed.siteSettings };
          this.applyActiveTheme();
          return;
        }
      } catch (err) {
        console.warn('Failed to parse draft:', err);
      }
    }

    // No local draft – try server FIRST (api.php or data/site.json fallback)
    // so migrated hosts load published content into admin instead of showing default template.
    try {
      const data = await this.fetchSiteFromServer();
      if (data) {
        if (data.siteSettings) this.siteSettings = { ...this.siteSettings, ...data.siteSettings };
        if (Array.isArray(data.pages) && data.pages.length > 0) {
          this.pages         = data.pages;
          this.currentPageId = data.currentPageId || this.pages[0].id;
          localStorage.setItem(STORAGE_KEY_DRAFT, JSON.stringify({
            pages: this.pages,
            currentPageId: this.currentPageId,
            siteSettings: this.siteSettings
          }));
          localStorage.setItem(STORAGE_KEY_PUBLIC, JSON.stringify(data));
          this.applyActiveTheme();
          return;
        } else if (Array.isArray(data.sections) && data.sections.length > 0) {
          const pg = makeDefaultPage(makePageId(), 'index', 'Home', data.sections);
          if (data.pageSettings) pg.pageSettings = { ...pg.pageSettings, ...data.pageSettings };
          this.pages = [pg];
          this.currentPageId = pg.id;
          localStorage.setItem(STORAGE_KEY_DRAFT, JSON.stringify({
            pages: this.pages,
            currentPageId: this.currentPageId,
            siteSettings: this.siteSettings
          }));
          localStorage.setItem(STORAGE_KEY_PUBLIC, JSON.stringify(data));
          this.applyActiveTheme();
          return;
        }
      }
    } catch { /* Server unreachable – fall through to default template */ }

    // Absolute fallback: no local draft, no server data → load default SaaS template
    const homePage = makeDefaultPage(makePageId(), 'index', 'Home');
    this.pages = [homePage];
    this.currentPageId = homePage.id;
    this.loadTemplate('saas', false);
    this.applyActiveTheme();
  }

  async syncFromServer(force = false) {
    try {
      const data = await this.fetchSiteFromServer();
      if (!data) return false;
      localStorage.setItem(STORAGE_KEY_PUBLIC, JSON.stringify(data));
      if (force || !localStorage.getItem(STORAGE_KEY_DRAFT)) {
        if (data.siteSettings) this.siteSettings = { ...this.siteSettings, ...data.siteSettings };
        if (Array.isArray(data.pages) && data.pages.length > 0) {
          this.pages         = data.pages;
          this.currentPageId = data.currentPageId || this.pages[0].id;
        } else if (Array.isArray(data.sections) && data.sections.length > 0) {
          const pg = makeDefaultPage(makePageId(), 'index', 'Home', data.sections);
          if (data.pageSettings) pg.pageSettings = { ...pg.pageSettings, ...data.pageSettings };
          this.pages         = [pg];
          this.currentPageId = pg.id;
        }
        localStorage.setItem(STORAGE_KEY_DRAFT, JSON.stringify({
          pages: this.pages,
          currentPageId: this.currentPageId,
          siteSettings: this.siteSettings
        }));
        applyTheme(this.pageSettings.themePreset, this.pageSettings.fontFamily);
        this.notify('serverSync');
        return true;
      }
    } catch {}
    return false;
  }

  // ── Pub/Sub ────────────────────────────────────────────────────────────────
  subscribe(fn)             { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  notify(actionType = 'update') {
    this.saveDraft();
    for (const fn of this.listeners) {
      try { fn(this, actionType); } catch (e) { console.error(e); }
    }
  }

  // ── Undo / Redo ────────────────────────────────────────────────────────────
  pushSnapshot() {
    const snap = JSON.stringify({ pages: this.pages, currentPageId: this.currentPageId, siteSettings: this.siteSettings });
    if (this.undoStack.length > 0 && this.undoStack[this.undoStack.length - 1] === snap) return;
    this.undoStack.push(snap);
    if (this.undoStack.length > this.maxHistory) this.undoStack.shift();
    this.redoStack = [];
  }

  _restoreSnapshot(snap) {
    const parsed = JSON.parse(snap);
    if (parsed.siteSettings) {
      this.siteSettings = parsed.siteSettings;
    }
    if (Array.isArray(parsed.pages)) {
      this.pages         = parsed.pages;
      this.currentPageId = parsed.currentPageId || this.pages[0]?.id;
    } else if (Array.isArray(parsed.sections)) {
      // Legacy single-page snap
      this.sections = parsed.sections;
      if (parsed.pageSettings) {
        this.pageSettings = { ...this.pageSettings, ...parsed.pageSettings };
      }
    }
    applyTheme(this.pageSettings?.themePreset, this.pageSettings?.fontFamily);
  }

  undo() {
    if (this.undoStack.length <= 1) return false;
    const current = this.undoStack.pop();
    this.redoStack.push(current);
    this._restoreSnapshot(this.undoStack[this.undoStack.length - 1]);
    this.notify('undo');
    return true;
  }

  redo() {
    if (this.redoStack.length === 0) return false;
    const next = this.redoStack.pop();
    this.undoStack.push(next);
    this._restoreSnapshot(next);
    this.notify('redo');
    return true;
  }

  canUndo() { return this.undoStack.length > 1; }
  canRedo() { return this.redoStack.length > 0; }

  // ── Persistence ────────────────────────────────────────────────────────────
  saveDraft() {
    try {
      localStorage.setItem(STORAGE_KEY_DRAFT, JSON.stringify({
        updatedAt:     new Date().toISOString(),
        pages:         this.pages,
        currentPageId: this.currentPageId,
        siteSettings:  this.siteSettings
      }));
    } catch (e) { console.error('Storage error:', e); }
  }

  setSiteSetting(key, val) {
    if (!this.siteSettings) this.siteSettings = {};
    this.pushSnapshot();
    this.siteSettings[key] = val;
    this.saveDraft();
    this.notify('siteSettings');
  }

  async publishToLive() {
    const payload = {
      publishedAt:   new Date().toISOString(),
      currentPageId: this.currentPageId,
      pages:         this.pages,
      siteSettings:  this.siteSettings
    };
    try { localStorage.setItem(STORAGE_KEY_PUBLIC, JSON.stringify(payload)); } catch {}
    try {
      const headers = { 'Content-Type': 'application/json' };
      if (typeof window !== 'undefined' && window.auth && typeof window.auth.getAdminPassword === 'function') {
        headers['X-Admin-Password'] = window.auth.getAdminPassword();
      }
      const res = await fetch('api.php?action=publish', {
        method:  'POST',
        headers: headers,
        body:    JSON.stringify(payload)
      });
      if (res.ok) {
        const result = await res.json();
        console.log('✅ Multi-page publish live!', result);
        return true;
      } else {
        console.warn('Publish API HTTP status:', res.status);
      }
    } catch (err) { console.log('Offline / static mode: LocalStorage updated.', err); }
    return true;
  }

  getPublicSiteData() {
    const raw = localStorage.getItem(STORAGE_KEY_PUBLIC);
    if (raw) {
      try { return JSON.parse(raw); } catch {}
    }
    return {
      publishedAt:   new Date().toISOString(),
      currentPageId: this.currentPageId,
      pages:         this.pages,
      siteSettings:  this.siteSettings
    };
  }

  getPublicSections(pageSlug = 'index') {
    const pubData = this.getPublicSiteData();
    let rawSections = [];
    let allPages = [];
    if (pubData) {
      if (Array.isArray(pubData.pages) && pubData.pages.length > 0) {
        allPages = pubData.pages;
        const page = pubData.pages.find(p => p.slug === pageSlug)
                  || (pageSlug === 'index' ? pubData.pages.find(p => p.slug === 'home') : null)
                  || (pageSlug === 'home' ? pubData.pages.find(p => p.slug === 'index') : null)
                  || pubData.pages.find(p => p.slug === 'index')
                  || pubData.pages[0];
        rawSections = page ? (page.sections || []) : [];
      } else if (Array.isArray(pubData.sections)) {
        rawSections = pubData.sections;
      }
    } else {
      rawSections = this._publicSections || (this.currentPage ? this.currentPage.sections : []);
      allPages = this.pages || [];
    }

    let finalSections = [...rawSections];
    const hasNavbar = finalSections.some(s => s.widgetType === 'navbar');
    if (!hasNavbar && allPages.length > 0) {
      for (const pg of allPages) {
        const globalNav = (pg.sections || []).find(s => s.widgetType === 'navbar' && s.props?.globalHeader !== false);
        if (globalNav) {
          finalSections = [globalNav, ...finalSections];
          break;
        }
      }
    }
    const hasFooter = finalSections.some(s => s.widgetType === 'footer');
    if (!hasFooter && allPages.length > 0) {
      for (const pg of allPages) {
        const globalFoot = (pg.sections || []).find(s => s.widgetType === 'footer' && s.props?.globalFooter === true);
        if (globalFoot) {
          finalSections = [...finalSections, globalFoot];
          break;
        }
      }
    }
    return finalSections;
  }

  // ── Page Management ────────────────────────────────────────────────────────
  addPage(title, slug) {
    this.pushSnapshot();
    const safeslug = (slug || title || 'page')
      .toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9\-]/g, '');
    const newPage  = makeDefaultPage(makePageId(), safeslug || 'page', title || 'New Page');
    this.pages.push(newPage);
    this.currentPageId  = newPage.id;
    this.activeElementId = null;
    this.notify('pageAdded');
    return newPage;
  }

  deletePage(pageId) {
    if (this.pages.length <= 1) return false; // Must keep at least one page
    const idx = this.pages.findIndex(p => p.id === pageId);
    if (idx === -1) return false;
    this.pushSnapshot();
    this.pages.splice(idx, 1);
    if (this.currentPageId === pageId) {
      this.currentPageId  = this.pages[Math.max(0, idx - 1)].id;
      this.activeElementId = null;
    }
    this.notify('pageDeleted');
    return true;
  }

  duplicatePage(pageId) {
    const src = this.pages.find(p => p.id === pageId);
    if (!src) return;
    this.pushSnapshot();
    const clone = JSON.parse(JSON.stringify(src));
    clone.id    = makePageId();
    clone.slug  = src.slug + '-copy';
    clone.title = src.title + ' (Copy)';
    clone.pageSettings.pageTitle = clone.title;
    const idx   = this.pages.findIndex(p => p.id === pageId);
    this.pages.splice(idx + 1, 0, clone);
    this.currentPageId  = clone.id;
    this.activeElementId = null;
    this.notify('pageDuplicated');
    return clone;
  }

  switchPage(pageId) {
    if (pageId === this.currentPageId) return;
    const page = this.pages.find(p => p.id === pageId);
    if (!page) return;
    this.currentPageId  = pageId;
    this.activeElementId = null;
    applyTheme(page.pageSettings.themePreset, page.pageSettings.fontFamily);
    this.notify('pageSwitched');
  }

  reorderPages(fromIndex, toIndex) {
    if (fromIndex === toIndex) return;
    this.pushSnapshot();
    const [moved] = this.pages.splice(fromIndex, 1);
    this.pages.splice(toIndex, 0, moved);
    this.notify('pageReordered');
  }

  updatePageMeta(pageId, title, slug) {
    const page = this.pages.find(p => p.id === pageId);
    if (!page) return;
    this.pushSnapshot();
    if (title) { page.title = title; page.pageSettings.pageTitle = title; }
    if (slug)  {
      page.slug = slug.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9\-]/g, '');
    }
    this.notify('pageMeta');
  }

  applyActiveTheme() {
    if (this.pageSettings) {
      applyTheme(this.pageSettings.themePreset, this.pageSettings.fontFamily, this.pageSettings.themeCustom);
    }
  }

  // ── Page Settings ──────────────────────────────────────────────────────────
  setPageSetting(key, value) {
    if (!this.currentPage) return;
    this.pushSnapshot();
    this.currentPage.pageSettings[key] = value;
    if (key === 'themePreset' || key === 'fontFamily' || key === 'themeCustom') {
      this.applyActiveTheme();
    }
    this.notify('pageSettings');
  }

  // ── Element Selection ──────────────────────────────────────────────────────
  setActiveElement(id)   { this.activeElementId = id; this.notify('selection'); }
  getActiveElement() {
    if (!this.activeElementId) return null;
    return this.sections.find(s => s.id === this.activeElementId) || null;
  }

  // ── Viewport ───────────────────────────────────────────────────────────────
  setViewportMode(mode) {
    if (['desktop','tablet','mobile'].includes(mode)) {
      this.viewportMode = mode;
      this.notify('viewport');
    }
  }

  // ── Section / Widget Operations ────────────────────────────────────────────
  addSection(widgetType, atIndex = null) {
    this.pushSnapshot();
    const widgetDef = WIDGET_REGISTRY[widgetType];
    if (!widgetDef) { console.error(`Unknown widget: ${widgetType}`); return null; }
    const newId = `sec_${Date.now()}_${Math.random().toString(36).substr(2,5)}`;
    const newSection = { id: newId, widgetType, props: JSON.parse(JSON.stringify(widgetDef.defaultProps)) };
    const targetArray = this.rawSections;
    if (atIndex !== null && atIndex >= 0 && atIndex <= targetArray.length) {
      targetArray.splice(atIndex, 0, newSection);
    } else {
      targetArray.push(newSection);
    }
    this.activeElementId = newId;
    this.notify('add');
    return newSection;
  }

  updateElementProps(id, newProps) {
    const sec = this.rawSections.find(s => s.id === id);
    if (!sec) return;
    this.pushSnapshot();
    sec.props = { ...sec.props, ...newProps };
    this.notify('propUpdate');
  }

  deleteElement(id) {
    this.pushSnapshot();
    const targetArray = this.rawSections;
    const idx = targetArray.findIndex(s => s.id === id);
    if (idx !== -1) {
      targetArray.splice(idx, 1);
      if (this.activeElementId === id) this.activeElementId = null;
      this.notify('delete');
    }
  }

  duplicateElement(id) {
    const targetArray = this.rawSections;
    const idx = targetArray.findIndex(s => s.id === id);
    if (idx === -1) return;
    this.pushSnapshot();
    const src = targetArray[idx];
    const clone = { id: `sec_${Date.now()}_${Math.random().toString(36).substr(2,5)}`,
                    widgetType: src.widgetType, props: JSON.parse(JSON.stringify(src.props)) };
    targetArray.splice(idx + 1, 0, clone);
    this.activeElementId = clone.id;
    this.notify('duplicate');
  }

  moveElement(id, direction) {
    const targetArray = this.rawSections;
    const idx = targetArray.findIndex(s => s.id === id);
    if (idx === -1) return;
    const target = direction === 'up' ? idx - 1 : idx + 1;
    if (target < 0 || target >= targetArray.length) return;
    this.pushSnapshot();
    [targetArray[idx], targetArray[target]] = [targetArray[target], targetArray[idx]];
    this.notify('move');
  }

  reorderSections(fromIndex, toIndex) {
    if (fromIndex === toIndex) return;
    const targetArray = this.rawSections;
    if (fromIndex < 0 || fromIndex >= targetArray.length) return;
    if (toIndex < 0 || toIndex >= targetArray.length) return;
    this.pushSnapshot();
    const [moved] = targetArray.splice(fromIndex, 1);
    targetArray.splice(toIndex, 0, moved);
    if (moved?.id) this.activeElementId = moved.id;
    this.notify('move');
  }

  // ── Templates ──────────────────────────────────────────────────────────────
  loadTemplate(templateId, recordSnapshot = true) {
    const tmpl = TEMPLATES[templateId];
    if (!tmpl) return;
    if (recordSnapshot) this.pushSnapshot();
    this.sections        = JSON.parse(JSON.stringify(tmpl.sections));
    this.activeElementId = null;
    this.notify('loadTemplate');
  }

  clearCanvas() {
    this.pushSnapshot();
    this.sections        = [];
    this.activeElementId = null;
    this.notify('clear');
  }

  // ── JSON Export / Import (all pages) ──────────────────────────────────────
  exportJSON() {
    return JSON.stringify({
      version:       '2.0',
      exportedAt:    new Date().toISOString(),
      currentPageId: this.currentPageId,
      siteSettings:  this.siteSettings,
      pages:         this.pages
    }, null, 2);
  }

  importJSON(jsonString) {
    try {
      const data = JSON.parse(jsonString);
      this.pushSnapshot();
      if (data.siteSettings) {
        this.siteSettings = { ...this.siteSettings, ...data.siteSettings };
      }
      // Multi-page format
      if (Array.isArray(data.pages) && data.pages.length > 0) {
        this.pages         = data.pages;
        this.currentPageId = data.currentPageId || data.pages[0].id;
        this.applyActiveTheme();
        this.activeElementId = null;
        this.notify('import');
        return true;
      }
      // Legacy single-page import
      if (Array.isArray(data.sections)) {
        const pg = makeDefaultPage(makePageId(), 'index', 'Home', data.sections);
        if (data.pageSettings) pg.pageSettings = { ...pg.pageSettings, ...data.pageSettings };
        this.pages         = [pg];
        this.currentPageId = pg.id;
        this.applyActiveTheme();
        this.activeElementId = null;
        this.notify('import');
        return true;
      }
      return false;
    } catch (err) { console.error('Import error:', err); return false; }
  }
}

export const state = new BuilderState();

