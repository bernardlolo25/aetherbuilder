/**
 * AETHERBUILDER - APPLICATION ROOT & ROUTER
 * Coordinates Public vs. Admin Studio views, Argon2 authentication gates, and Topbar tools.
 */

import { auth } from './auth.js';
import { state, sanitizeObject } from './state.js';
import { WIDGET_REGISTRY } from './widgets.js';
import { TEMPLATES } from './templates.js';
import { BuilderCanvas } from './builder.js';
import { InspectorPanel } from './inspector.js';
import { THEME_PRESETS, AVAILABLE_FONTS, applyTheme } from './themes.js';
import { initPublicChatbot, DEFAULT_CHATBOT_CONFIG } from './chatbot.js';
import { addonManager, AddonMaker } from './addons.js';
import './receipt.js';

// Expose auth globally so state.js publishToLive can access the admin password for API auth
window.auth = auth;

class AetherApp {
  constructor() {
    this.viewMode = this.detectViewMode();
    this.canvas = null;
    this.inspector = null;
  }

  detectViewMode() {
    const params = new URLSearchParams(window.location.search);
    const view = params.get('view');
    // Admin is only accessible via ?view=admin (triggered by Ctrl+Alt+A shortcut)
    if (view === 'admin' || window.location.pathname.endsWith('admin.html')) {
      return 'admin';
    }
    // Default to public view for all visitors
    return 'public';
  }

  async start() {
    // Wait for Argon2 authentication module readiness
    await auth.init();

    // Initialize Add-ons & Plugins engine (loads custom widgets into WIDGET_REGISTRY)
    await addonManager.init();

    if (this.viewMode === 'public') {
      this.initPublicView();
    } else {
      // IMPORTANT: await state.init() so migrated hosts load published
      // content from server BEFORE the admin canvas is rendered.
      // Without this, new hosts show the default SaaS template.
      await state.init();
      this.initAdminView();
    }
  }

  // --------------------------------------------------------------------------
  // PUBLIC VIEW MODE  (multi-page router)
  // --------------------------------------------------------------------------
  async initPublicView() {
    // Always fetch fresh published data from server first, fall back to localStorage
    let liveData = null;
    let fromServer = false;
    const ts = Date.now();
    try {
      const res = await fetch(`api.php?action=get_site&_t=${ts}`, { cache: 'no-store' });
      if (res.ok) {
        liveData = await res.json();
        fromServer = true;
      }
    } catch {}

    // Fallback: try direct data/site.json static fetch if api.php failed or returned empty
    if (!liveData || (!liveData.pages && !liveData.sections)) {
      try {
        const res2 = await fetch(`data/site.json?_t=${ts}`, { cache: 'no-store' });
        if (res2.ok) {
          liveData = await res2.json();
          fromServer = true;
        }
      } catch {}
    }

    // If server fetch failed, try localStorage (both new and legacy keys)
    if (!liveData || (!liveData.pages && !liveData.sections)) {
      const raw = localStorage.getItem('aether_public_site_v2')
             || localStorage.getItem('aether_public_site');
      if (raw) { try { liveData = JSON.parse(raw); } catch {} }
    }

    // Last resort: use current in-memory state
    if (!liveData) liveData = state.getPublicSiteData();

    // Sanitize any incoming mojibake from legacy data
    liveData = sanitizeObject(liveData);

    // Overwrite localStorage with clean sanitized data (purges old corrupt cache)
    if (fromServer && (liveData.pages || liveData.sections)) {
      try {
        localStorage.setItem('aether_public_site_v2', JSON.stringify(liveData));
        // Remove old legacy key if it exists
        localStorage.removeItem('aether_public_site');
      } catch {}
    }


    // Cache liveData in state for runtime queries
    if (Array.isArray(liveData.pages) && liveData.pages.length > 0) {
      state.pages = liveData.pages;
    }

    // Determine which page to render based on ?page=slug query param
    const params   = new URLSearchParams(window.location.search);
    let pageSlug   = params.get('page') || 'index';
    if (pageSlug === 'home') pageSlug = 'index';

    let activePage = null;
    if (Array.isArray(liveData.pages) && liveData.pages.length > 0) {
      // Multi-page format
      activePage = liveData.pages.find(p => p.slug === pageSlug)
                || (pageSlug === 'index' ? liveData.pages.find(p => p.slug === 'home') : null)
                || (pageSlug === 'home' ? liveData.pages.find(p => p.slug === 'index') : null)
                || liveData.pages.find(p => p.slug === 'index')
                || liveData.pages[0];
    } else {
      // Legacy single-page format
      activePage = {
        title:        liveData.pageSettings?.pageTitle || 'Home',
        sections:     liveData.sections || [],
        pageSettings: liveData.pageSettings || {}
      };
    }

    const ps = activePage.pageSettings || {};
    applyTheme(ps.themePreset || 'dark-neon', ps.fontFamily, ps.themeCustom);
    const pageTitle = ps.pageTitle || activePage.title || 'Site';
    document.title = pageTitle;

    // Inject SEO & Social meta tags into <head>
    const injectMeta = (attrs) => {
      const key = attrs.name ? `meta[name="${attrs.name}"]` : attrs.property ? `meta[property="${attrs.property}"]` : null;
      if (key) document.head.querySelector(key)?.remove();
      const el = document.createElement('meta');
      Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
      document.head.appendChild(el);
    };
    const setLink = (rel, href) => {
      document.head.querySelector(`link[rel="${rel}"]`)?.remove();
      if (!href) return;
      const el = document.createElement('link');
      el.rel = rel; el.href = href;
      document.head.appendChild(el);
    };
    if (ps.metaDescription) injectMeta({ name: 'description', content: ps.metaDescription });
    if (ps.metaKeywords)    injectMeta({ name: 'keywords',    content: ps.metaKeywords });
    if (ps.noIndex)         injectMeta({ name: 'robots',      content: 'noindex, nofollow' });
    injectMeta({ property: 'og:title',       content: pageTitle });
    if (ps.metaDescription) injectMeta({ property: 'og:description', content: ps.metaDescription });
    if (ps.ogImage)          injectMeta({ property: 'og:image',       content: ps.ogImage });
    injectMeta({ property: 'og:type', content: 'website' });
    setLink('canonical', ps.canonical || '');

    // Inject Site-Wide Settings (Favicon, Custom CSS, Analytics, Scripts)
    const siteSettings = liveData.siteSettings || state.siteSettings || {};

    // 1. Favicon
    if (siteSettings.faviconUrl) {
      setLink('icon', siteSettings.faviconUrl);
      setLink('shortcut icon', siteSettings.faviconUrl);
    }

    // 2. Custom Global CSS
    if (siteSettings.customCss) {
      let customStyle = document.getElementById('aether-site-custom-css');
      if (!customStyle) {
        customStyle = document.createElement('style');
        customStyle.id = 'aether-site-custom-css';
        document.head.appendChild(customStyle);
      }
      customStyle.textContent = siteSettings.customCss;
    }

    // 3. Google Analytics (GA4)
    if (siteSettings.gaId && !document.getElementById('aether-ga-script')) {
      const gaScript = document.createElement('script');
      gaScript.id = 'aether-ga-script';
      gaScript.async = true;
      gaScript.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(siteSettings.gaId)}`;
      document.head.appendChild(gaScript);

      const gaInit = document.createElement('script');
      gaInit.id = 'aether-ga-init';
      gaInit.textContent = `
        window.dataLayer = window.dataLayer || [];
        function gtag(){dataLayer.push(arguments);}
        gtag('js', new Date());
        gtag('config', '${siteSettings.gaId}');
      `;
      document.head.appendChild(gaInit);
    }

    // 4. Meta Pixel
    if (siteSettings.metaPixelId && !document.getElementById('aether-fb-pixel')) {
      const pixelScript = document.createElement('script');
      pixelScript.id = 'aether-fb-pixel';
      pixelScript.textContent = `
        !function(f,b,e,v,n,t,s)
        {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
        n.callMethod.apply(n,arguments):n.queue.push(arguments)};
        if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
        n.queue=[];t=b.createElement(e);t.async=!0;
        t.src=v;s=b.getElementsByTagName(e)[0];
        s.parentNode.insertBefore(t,s)}(window, document,'script',
        'https://connect.facebook.net/en_US/fbevents.js');
        fbq('init', '${siteSettings.metaPixelId}');
        fbq('track', 'PageView');
      `;
      document.head.appendChild(pixelScript);
    }

    // 5. Custom Header Code
    if (siteSettings.headerScripts && !document.getElementById('aether-header-injected')) {
      const headerDiv = document.createElement('div');
      headerDiv.id = 'aether-header-injected';
      headerDiv.style.display = 'none';
      headerDiv.innerHTML = siteSettings.headerScripts;
      document.head.appendChild(headerDiv);
    }

    // 6. Custom Footer Code
    if (siteSettings.footerScripts && !document.getElementById('aether-footer-injected')) {
      const footerDiv = document.createElement('div');
      footerDiv.id = 'aether-footer-injected';
      footerDiv.innerHTML = siteSettings.footerScripts;
      document.body.appendChild(footerDiv);
    }

    // 7. Global / Page Background Image
    const activePageBg = ps.pageBg;
    const globalBg = siteSettings.globalBg;
    const activeBg = (activePageBg && activePageBg.enabled && activePageBg.imageUrl)
      ? activePageBg
      : ((globalBg && globalBg.enabled && globalBg.imageUrl) ? globalBg : null);

    if (activeBg) {
      const op = activeBg.overlayOpacity !== undefined ? (Number(activeBg.overlayOpacity) / 100) : 0.5;
      document.body.style.backgroundImage = `linear-gradient(rgba(0,0,0,${op}), rgba(0,0,0,${op})), url('${activeBg.imageUrl}')`;
      document.body.style.backgroundSize = activeBg.size || 'cover';
      document.body.style.backgroundPosition = activeBg.position || 'center center';
      document.body.style.backgroundAttachment = activeBg.attachment || 'fixed';
      document.body.style.backgroundRepeat = activeBg.repeat || 'no-repeat';
    } else {
      document.body.style.backgroundImage = '';
      document.body.style.backgroundSize = '';
      document.body.style.backgroundPosition = '';
      document.body.style.backgroundAttachment = '';
      document.body.style.backgroundRepeat = '';
    }

    // Resolve sections including global navbar if current page has no navbar (and not hidden)
    let resolvedSections = [...(activePage.sections || [])];
    if (ps.hideHeader) {
      resolvedSections = resolvedSections.filter(s => s.widgetType !== 'navbar');
    } else {
      const hasNavbar = resolvedSections.some(s => s.widgetType === 'navbar');
      if (!hasNavbar && Array.isArray(liveData.pages) && liveData.pages.length > 0) {
        for (const pg of liveData.pages) {
          const globalNav = (pg.sections || []).find(s => s.widgetType === 'navbar' && s.props?.globalHeader !== false);
          if (globalNav) {
            resolvedSections = [globalNav, ...resolvedSections];
            break;
          }
        }
      }
    }

    // Inject global footer if current page has no footer (and not hidden)
    if (ps.hideFooter) {
      resolvedSections = resolvedSections.filter(s => s.widgetType !== 'footer');
    } else {
      const hasFooter = resolvedSections.some(s => s.widgetType === 'footer');
      if (!hasFooter && Array.isArray(liveData.pages) && liveData.pages.length > 0) {
        for (const pg of liveData.pages) {
          const globalFoot = (pg.sections || []).find(s => s.widgetType === 'footer' && s.props?.globalFooter === true);
          if (globalFoot) {
            resolvedSections = [...resolvedSections, globalFoot];
            break;
          }
        }
      }
    }

    // Set public sections directly in state so BuilderCanvas can render them
    state._publicSections = resolvedSections;
    if (state.currentPage) {
      state.currentPage.sections = resolvedSections;
    }

    let container = document.getElementById('public-site-container');
    if (!container) {
      document.body.innerHTML = `
        <div id="public-site-container" style="width: 100%; min-height: 100vh; position: relative;"></div>
      `;
      container = document.getElementById('public-site-container');

      // Hidden admin access: Ctrl + Alt + A
      document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.altKey && (e.key === 'a' || e.key === 'A')) {
          e.preventDefault();
          window.location.href = '?view=admin';
        }
      });

      // Handle browser back/forward buttons
      window.addEventListener('popstate', () => {
        this.initPublicView();
      });

      // Handle internal link navigation seamlessly
      document.addEventListener('click', (e) => {
        const link = e.target.closest('a');
        if (!link) return;
        const href = link.getAttribute('href');
        if (!href || href.startsWith('#') || href.startsWith('http://') || href.startsWith('https://') || href.startsWith('mailto:') || href.startsWith('tel:')) return;

        // If clicking a relative page link (e.g. ?page=about, index.html, index.html?page=about)
        if (href.startsWith('?') || href.startsWith('index.html') || href.startsWith('public.html') || href.startsWith('./')) {
          e.preventDefault();
          const targetUrl = new URL(href, window.location.href);
          window.history.pushState(null, '', targetUrl.href);
          this.initPublicView();
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      });
    }

    if (ps.transparentHeader) {
      container.classList.add('has-transparent-header');
    } else {
      container.classList.remove('has-transparent-header');
    }

    this.canvas = new BuilderCanvas(container, true);

    // Mount 24/7 Decision-Tree Chatbot on public live site
    const cbConfig = siteSettings.chatbot || DEFAULT_CHATBOT_CONFIG;
    if (cbConfig.enabled !== false) {
      initPublicChatbot(cbConfig);
    }
  }


  // --------------------------------------------------------------------------
  // ADMIN STUDIO VIEW MODE (ARGON2 PROTECTED)
  // --------------------------------------------------------------------------
  async initAdminView() {
    applyTheme(state.pageSettings.themePreset || 'dark-neon', state.pageSettings.fontFamily, state.pageSettings.themeCustom);
    if (state.pageSettings.pageTitle) {
      document.title = `${state.pageSettings.pageTitle} (Admin Studio)`;
    }

    if (!auth.isAuthenticated()) {
      // Prompt user with Argon2 password verification
      auth.showLoginModal(() => {
        this.renderAdminStudio();
      });
    } else {
      this.renderAdminStudio();
    }
  }

  renderAdminStudio() {
    document.body.innerHTML = `
      <div class="builder-shell">
        <!-- 1. Top Navigation Bar -->
        <header class="builder-topbar">
          <div class="flex items-center gap-4">
            <a href="#" class="topbar-brand">
              <div class="topbar-logo-badge">⚡</div>
              <div>
                <span>AetherBuilder</span>
                <span style="font-size: 0.72rem; color: var(--text-dim); margin-left: 4px; font-weight: 500;">v2.6</span>
              </div>
            </a>

            <!-- Viewport Switcher -->
            <div class="device-toggle-group">
              <button class="device-btn active" data-mode="desktop" title="Desktop View (100%)">🖥️ Desktop</button>
              <button class="device-btn" data-mode="tablet" title="Tablet View (768px)">📱 Tablet</button>
              <button class="device-btn" data-mode="mobile" title="Mobile View (390px)">📱 Mobile</button>
            </div>
          </div>

          <!-- History & Tools Center -->
          <div class="topbar-controls-center">
            <div class="history-btn-group">
              <button class="tool-icon-btn" id="btn-undo" title="Undo (Ctrl+Z)">↶</button>
              <button class="tool-icon-btn" id="btn-redo" title="Redo (Ctrl+Y)">↷</button>
            </div>
            <button class="topbar-btn topbar-btn-sm" id="btn-templates">
              <span>📋</span> Templates
            </button>
            <button class="topbar-btn topbar-btn-sm" id="btn-revisions" title="Publish Version History & 1-Click Rollback">
              <span>🕒</span> Revisions
            </button>
            <button class="topbar-btn topbar-btn-sm" id="btn-seo-audit" title="Pre-Publish SEO & Accessibility Health Audit" style="border-color: rgba(16,185,129,0.35); color: #34d399;">
              <span>🛡️</span> SEO Audit
            </button>
            <button class="topbar-btn topbar-btn-sm" id="btn-export">
              <span>📤</span> Export
            </button>
            <button class="tool-icon-btn" id="btn-clear" title="Clear Canvas" style="color: var(--danger);">🗑</button>
          </div>

          <!-- Actions & Security Right -->
          <div class="topbar-actions">
            <!-- Notifications & Leads Hub -->
            <button class="tool-icon-btn" id="btn-notifications" title="Notifications & Leads Inbox" style="position: relative;">
              <span>🔔</span>
              <span id="notif-badge" style="display:none; position:absolute; top:-4px; right:-4px; background:#ef4444; color:#fff; font-size:0.62rem; font-weight:800; border-radius:10px; min-width:16px; height:16px; padding:0 3px; line-height:16px; text-align:center; box-shadow:0 0 8px rgba(239,68,68,0.8);">0</span>
            </button>

            <!-- Media Library -->
            <button class="tool-icon-btn" id="btn-media" title="Media Library">
              <span>🖼️</span>
            </button>

            <!-- Argon2 Security Badge -->
            <div class="security-badge" id="btn-security" title="Argon2id WebAssembly Active. Click to manage password.">
              <span>🔐</span>
              <span>Argon2id</span>
            </div>

            <!-- Public Site Link -->
            <a href="?view=public" target="_blank" class="tool-icon-btn" title="Open live public view in new tab" style="text-decoration:none;display:flex;align-items:center;gap:4px;">
              <span>🌐</span>
            </a>

            <!-- Sync / Pull Latest from Server -->
            <button class="tool-icon-btn" id="btn-sync-server" title="Sync from Server: Load latest published content from data/site.json into builder">
              <span>🔄</span>
            </button>

            <!-- Publish Button -->
            <button class="topbar-btn topbar-btn-publish" id="btn-publish">
              <span>🚀</span> Publish Live
            </button>

            <!-- Admin Logout -->
            <button class="tool-icon-btn" id="btn-logout" title="Lock Admin Studio">
              <span>🚪</span>
            </button>
          </div>
        </header>

        <!-- 2. Builder Workspace (Sidebar + Canvas) -->
        <main class="builder-body">
          <!-- Left Sidebar (Widgets & Inspector - Resizable & Slidable) -->
          <aside class="builder-sidebar" id="builder-sidebar">
            <!-- Sidebar Resizer Handle -->
            <div class="sidebar-resizer" id="sidebar-resizer" title="Drag to resize sidebar width (Double-click to toggle)"></div>
            <!-- Toggle Resize Button -->
            <button class="sidebar-resize-toggle" id="sidebar-resize-toggle" title="Toggle Sidebar Resizing">🔓</button>

            <!-- Tab Navigation Header with Slide Controls -->
            <div class="sidebar-tabs-nav">
              <button type="button" class="sidebar-tab-arrow prev" id="tab-arrow-prev" title="Scroll tabs left" aria-label="Previous tabs">‹</button>
              <div class="sidebar-tabs" id="sidebar-tabs">
                <button type="button" class="sidebar-tab-btn active" data-side-tab="widgets">Widgets</button>
                <button type="button" class="sidebar-tab-btn" data-side-tab="inspector">Inspector</button>
                <button type="button" class="sidebar-tab-btn" data-side-tab="pages">📱 Pages</button>
                <button type="button" class="sidebar-tab-btn" data-side-tab="settings">Page</button>
                <button type="button" class="sidebar-tab-btn" data-side-tab="sitesettings">⚙️ Site</button>
                <button type="button" class="sidebar-tab-btn" data-side-tab="addons">🧩 Add-ons</button>
              </div>
              <button type="button" class="sidebar-tab-arrow next" id="tab-arrow-next" title="Scroll tabs right" aria-label="Next tabs">›</button>
            </div>

            <div class="sidebar-content-area" id="sidebar-tab-content">
              <!-- Widgets Tray Container -->
              <div id="tab-widgets-panel">
                <div class="widget-search-box" style="margin-bottom: 14px;">
                  <span class="widget-search-icon">🔍</span>
                  <input type="text" class="widget-search-input" id="widget-search" placeholder="Search elements..." />
                </div>
                <div id="widgets-list-container">
                  <!-- Dynamically Rendered Categories -->
                </div>
              </div>

              <!-- Element Inspector Container -->
              <div id="tab-inspector-panel" style="display: none; height: 100%;">
                <!-- Inspector controls rendered here -->
              </div>

              <!-- Pages Manager Container -->
              <div id="tab-pages-panel" style="display: none;">
                <!-- Pages manager rendered here -->
              </div>

              <!-- Page Settings Container -->
              <div id="tab-settings-panel" style="display: none;">
                <div style="font-weight: 700; font-size: 1rem; margin-bottom: 14px; display: flex; align-items: center; justify-content: space-between;">
                  <span>Page Settings</span>
                  <span style="font-size: 0.72rem; color: var(--primary-light); background: var(--primary-soft); padding: 3px 8px; border-radius: 12px; font-weight: 700;">Realtime Engine</span>
                </div>
                <div class="prop-group">
                  <label class="prop-label">Page Title</label>
                  <input type="text" id="page-title-input" placeholder="Page Title..." />
                </div>
                <div class="prop-group" style="margin-top: 12px;">
                  <label class="prop-label">Theme Preset</label>
                  <select id="theme-preset-select"></select>
                </div>
                <div class="prop-group" style="margin-top: 10px;">
                  <label class="prop-label" style="margin-bottom: 4px;">Preset Palettes</label>
                  <div class="theme-swatch-list" id="theme-swatch-list"></div>
                </div>
                <div class="prop-group" style="margin-top: 16px;">
                  <label class="prop-label">Base Font Family</label>
                  <select id="font-family-select"></select>
                </div>
                <!-- Page Layout & Global Header / Footer Controls -->
                <div class="prop-group" style="margin-top: 18px; padding-top: 14px; border-top: 1px solid var(--border-subtle);">
                  <div style="font-weight: 700; font-size: 0.88rem; color: #f8fafc; margin-bottom: 10px; display: flex; align-items: center; justify-content: space-between;">
                    <span>🌐 Layout & Header / Footer</span>
                  </div>
                  <div style="display: flex; flex-direction: column; gap: 8px;">
                    <label style="font-size: 0.82rem; color: var(--text-main); display: flex; align-items: center; gap: 8px; cursor: pointer;">
                      <input type="checkbox" id="page-hide-header" style="cursor: pointer;" />
                      <span>🚫 Hide Header / Navbar on this Page</span>
                    </label>
                    <label style="font-size: 0.82rem; color: var(--text-main); display: flex; align-items: center; gap: 8px; cursor: pointer;">
                      <input type="checkbox" id="page-hide-footer" style="cursor: pointer;" />
                      <span>🚫 Hide Footer on this Page</span>
                    </label>
                    <label style="font-size: 0.82rem; color: var(--text-main); display: flex; align-items: center; gap: 8px; cursor: pointer;">
                      <input type="checkbox" id="page-transparent-header" style="cursor: pointer;" />
                      <span>🪟 Transparent Header Over Hero</span>
                    </label>
                  </div>
                </div>
                <!-- Custom Palette & Theme Customizer -->
                <div class="prop-group" style="margin-top: 18px; padding-top: 14px; border-top: 1px solid var(--border-subtle);">
                  <div style="font-weight: 700; font-size: 0.88rem; color: #f8fafc; margin-bottom: 8px; display: flex; align-items: center; justify-content: space-between;">
                    <span>🎨 Custom Palette Builder</span>
                    <label style="font-weight: 500; font-size: 0.78rem; color: var(--primary-light); cursor: pointer; display: flex; align-items: center; gap: 4px;">
                      <input type="checkbox" id="theme-custom-enable" /> Custom Colors
                    </label>
                  </div>
                  <div id="theme-custom-controls" style="display: none; background: rgba(0,0,0,0.3); padding: 10px; border-radius: 8px; border: 1px solid var(--border-subtle); margin-top: 8px;">
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 0.75rem;">
                      <div>
                        <label class="prop-label" style="font-size:0.7rem; margin-bottom:2px;">Primary Color</label>
                        <div style="display:flex; align-items:center; gap:6px;">
                          <input type="color" id="theme-custom-primary" value="#6366f1" style="width:28px; height:28px; border:none; background:none; cursor:pointer; padding:0;" />
                          <input type="text" id="theme-custom-primary-hex" value="#6366f1" style="font-size:0.72rem; padding:2px 5px; font-family:monospace; width:100%; border-radius:4px;" />
                        </div>
                      </div>
                      <div>
                        <label class="prop-label" style="font-size:0.7rem; margin-bottom:2px;">Secondary Color</label>
                        <div style="display:flex; align-items:center; gap:6px;">
                          <input type="color" id="theme-custom-secondary" value="#ec4899" style="width:28px; height:28px; border:none; background:none; cursor:pointer; padding:0;" />
                          <input type="text" id="theme-custom-secondary-hex" value="#ec4899" style="font-size:0.72rem; padding:2px 5px; font-family:monospace; width:100%; border-radius:4px;" />
                        </div>
                      </div>
                      <div>
                        <label class="prop-label" style="font-size:0.7rem; margin-bottom:2px;">Accent Glow</label>
                        <div style="display:flex; align-items:center; gap:6px;">
                          <input type="color" id="theme-custom-accent" value="#06b6d4" style="width:28px; height:28px; border:none; background:none; cursor:pointer; padding:0;" />
                          <input type="text" id="theme-custom-accent-hex" value="#06b6d4" style="font-size:0.72rem; padding:2px 5px; font-family:monospace; width:100%; border-radius:4px;" />
                        </div>
                      </div>
                      <div>
                        <label class="prop-label" style="font-size:0.7rem; margin-bottom:2px;">Deep Background</label>
                        <div style="display:flex; align-items:center; gap:6px;">
                          <input type="color" id="theme-custom-bgdeep" value="#090d16" style="width:28px; height:28px; border:none; background:none; cursor:pointer; padding:0;" />
                          <input type="text" id="theme-custom-bgdeep-hex" value="#090d16" style="font-size:0.72rem; padding:2px 5px; font-family:monospace; width:100%; border-radius:4px;" />
                        </div>
                      </div>
                      <div>
                        <label class="prop-label" style="font-size:0.7rem; margin-bottom:2px;">Card Surface</label>
                        <div style="display:flex; align-items:center; gap:6px;">
                          <input type="color" id="theme-custom-bgcard" value="#131b2e" style="width:28px; height:28px; border:none; background:none; cursor:pointer; padding:0;" />
                          <input type="text" id="theme-custom-bgcard-hex" value="#131b2e" style="font-size:0.72rem; padding:2px 5px; font-family:monospace; width:100%; border-radius:4px;" />
                        </div>
                      </div>
                      <div>
                        <label class="prop-label" style="font-size:0.7rem; margin-bottom:2px;">Main Text</label>
                        <div style="display:flex; align-items:center; gap:6px;">
                          <input type="color" id="theme-custom-textmain" value="#f8fafc" style="width:28px; height:28px; border:none; background:none; cursor:pointer; padding:0;" />
                          <input type="text" id="theme-custom-textmain-hex" value="#f8fafc" style="font-size:0.72rem; padding:2px 5px; font-family:monospace; width:100%; border-radius:4px;" />
                        </div>
                      </div>
                    </div>
                    <div style="display: flex; gap: 6px; margin-top: 10px;">
                      <button type="button" id="btn-reset-theme-custom" class="btn btn-sm btn-outline-danger" style="flex: 1; font-size: 0.72rem; padding: 4px 6px;">
                        ↺ Reset
                      </button>
                      <button type="button" id="btn-apply-global-theme" class="btn btn-sm btn-primary" style="flex: 1; font-size: 0.72rem; padding: 4px 6px;" title="Apply theme & palette to all pages">
                        🌐 Apply All Pages
                      </button>
                    </div>
                  </div>
                </div>

                <!-- SEO & Social Meta -->
                <div class="prop-group" style="margin-top: 18px; padding-top: 14px; border-top: 1px solid var(--border-subtle);">
                  <div style="font-weight: 700; font-size: 0.88rem; color: #f8fafc; margin-bottom: 10px; display: flex; align-items: center; gap: 6px;">
                    <span>🔍</span> SEO &amp; Social Meta
                  </div>
                  <div style="display: flex; flex-direction: column; gap: 10px;">
                    <div>
                      <label class="prop-label" style="font-size:0.75rem;">Meta Description</label>
                      <textarea id="page-meta-description" rows="3" placeholder="Brief summary of this page for search engines (150–160 chars recommended)..." style="font-size:0.78rem; width:100%; resize:vertical; padding:6px 8px; border-radius:6px; border:1px solid var(--border-subtle); background:var(--bg-deep); color:var(--text-main);"></textarea>
                    </div>
                    <div>
                      <label class="prop-label" style="font-size:0.75rem;">Meta Keywords <span style="color:var(--text-dim);font-weight:400;">(comma separated)</span></label>
                      <input type="text" id="page-meta-keywords" placeholder="e.g. seminar, MCLE, legal education" style="font-size:0.78rem;" />
                    </div>
                    <div>
                      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                        <label class="prop-label" style="font-size:0.75rem; margin:0;">OG / Social Share Image URL</label>
                        <button type="button" id="btn-pick-og-image" class="btn btn-sm" style="font-size:0.7rem; padding: 2px 7px; background: rgba(99,102,241,0.15); border: 1px solid rgba(99,102,241,0.3); color: #a5b4fc; border-radius: 4px; cursor: pointer;">🖼️ Media</button>
                      </div>
                      <input type="text" id="page-og-image" placeholder="https://... or assets/uploads/og-image.jpg" style="font-size:0.78rem;" />
                      <div style="font-size:0.7rem; color:var(--text-dim); margin-top:3px;">Shown when sharing on Facebook, Twitter, WhatsApp, etc.</div>
                    </div>
                    <div>
                      <label class="prop-label" style="font-size:0.75rem;">Canonical URL <span style="color:var(--text-dim);font-weight:400;">(optional)</span></label>
                      <input type="text" id="page-canonical" placeholder="https://yourdomain.com/page-url" style="font-size:0.78rem;" />
                    </div>
                    <label style="font-size: 0.82rem; color: var(--text-main); display: flex; align-items: center; gap: 8px; cursor: pointer;">
                      <input type="checkbox" id="page-noindex" style="cursor: pointer;" />
                      <span>🚫 No-Index (hide from search engines)</span>
                    </label>
                  </div>
                </div>
              </div>

              <!-- Site-Wide Settings Container -->
              <div id="tab-sitesettings-panel" style="display: none; padding-bottom: 24px;">
                <div style="font-weight: 700; font-size: 1rem; margin-bottom: 14px; display: flex; align-items: center; justify-content: space-between;">
                  <span>⚙️ Site Settings</span>
                  <span style="font-size: 0.72rem; color: var(--accent-light, #38bdf8); background: rgba(56,189,248,0.12); padding: 3px 8px; border-radius: 12px; font-weight: 700;">Global</span>
                </div>

                <!-- Site Identity -->
                <div class="prop-group">
                  <div style="font-weight: 700; font-size: 0.86rem; color: #f8fafc; margin-bottom: 10px; display: flex; align-items: center; gap: 6px;">
                    <span>🌐</span> Site Identity &amp; Branding
                  </div>
                  <div style="display: flex; flex-direction: column; gap: 10px;">
                    <div>
                      <label class="prop-label" style="font-size:0.75rem;">Site Brand / Title</label>
                      <input type="text" id="site-name-input" placeholder="e.g. USPF MCLE - Modern Legal Excellence" style="font-size:0.78rem;" />
                    </div>
                    <div>
                      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                        <label class="prop-label" style="font-size:0.75rem; margin:0;">Favicon URL</label>
                        <button type="button" id="btn-pick-favicon" class="btn btn-sm" style="font-size:0.7rem; padding: 2px 7px; background: rgba(99,102,241,0.15); border: 1px solid rgba(99,102,241,0.3); color: #a5b4fc; border-radius: 4px; cursor: pointer;">🖼️ Media</button>
                      </div>
                      <div style="display: flex; align-items: center; gap: 6px;">
                        <input type="text" id="site-favicon-input" placeholder="assets/favicon.ico or https://..." style="font-size:0.78rem; flex: 1;" />
                        <img id="site-favicon-preview" src="" style="width: 22px; height: 22px; border-radius: 4px; object-fit: contain; display: none; background: #000; border: 1px solid var(--border-subtle);" alt="" />
                      </div>
                    </div>
                    <div>
                      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                        <label class="prop-label" style="font-size:0.75rem; margin:0;">Default Header Logo URL</label>
                        <button type="button" id="btn-pick-site-logo" class="btn btn-sm" style="font-size:0.7rem; padding: 2px 7px; background: rgba(99,102,241,0.15); border: 1px solid rgba(99,102,241,0.3); color: #a5b4fc; border-radius: 4px; cursor: pointer;">🖼️ Media</button>
                      </div>
                      <input type="text" id="site-logo-input" placeholder="https://... or assets/logo.png" style="font-size:0.78rem;" />
                    </div>
                  </div>
                </div>

                <!-- Global Background Image -->
                <div class="prop-group" style="margin-top: 18px; padding-top: 14px; border-top: 1px solid var(--border-subtle);">
                  <div style="font-weight: 700; font-size: 0.86rem; color: #f8fafc; margin-bottom: 10px; display: flex; align-items: center; justify-content: space-between;">
                    <span style="display:flex;align-items:center;gap:6px;"><span>🖼️</span> Global Background Image</span>
                    <label style="font-size:0.75rem;color:var(--text-dim);display:flex;align-items:center;gap:6px;cursor:pointer;">
                      <input type="checkbox" id="site-global-bg-enable" style="cursor:pointer;" />
                      <span>Enable</span>
                    </label>
                  </div>
                  <div id="site-global-bg-controls" style="display:none;flex-direction:column;gap:10px;">
                    <div>
                      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
                        <label class="prop-label" style="font-size:0.75rem;margin:0;">Background Image URL</label>
                        <button type="button" id="btn-pick-global-bg" class="btn btn-sm" style="font-size:0.7rem;padding:2px 7px;background:rgba(99,102,241,0.15);border:1px solid rgba(99,102,241,0.3);color:#a5b4fc;border-radius:4px;cursor:pointer;">🖼️ Media Library</button>
                      </div>
                      <div style="display:flex;align-items:center;gap:6px;">
                        <input type="text" id="site-global-bg-url" placeholder="assets/uploads/wallpaper.jpg or https://..." style="font-size:0.78rem;flex:1;" />
                        <button type="button" id="btn-clear-global-bg" class="btn btn-sm" style="font-size:0.7rem;padding:2px 6px;color:#fca5a5;background:rgba(239,68,68,0.12);border:1px solid rgba(239,68,68,0.25);border-radius:4px;cursor:pointer;" title="Clear image">✕</button>
                      </div>
                    </div>

                    <!-- Image Preview Thumbnail -->
                    <div id="site-global-bg-preview-wrap" style="display:none;height:65px;border-radius:6px;overflow:hidden;border:1px solid var(--border-subtle);background-size:cover;background-position:center;position:relative;">
                      <div style="position:absolute;bottom:3px;right:6px;font-size:0.65rem;color:#fff;background:rgba(0,0,0,0.65);padding:1px 5px;border-radius:4px;">Wallpaper Preview</div>
                    </div>

                    <!-- Display Modes -->
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
                      <div>
                        <label class="prop-label" style="font-size:0.72rem;">Display Size</label>
                        <select id="site-global-bg-size" style="font-size:0.75rem;width:100%;">
                          <option value="cover">Cover (Fill Screen)</option>
                          <option value="contain">Contain (Fit)</option>
                          <option value="auto">Original Size</option>
                        </select>
                      </div>
                      <div>
                        <label class="prop-label" style="font-size:0.72rem;">Scroll Behavior</label>
                        <select id="site-global-bg-attachment" style="font-size:0.75rem;width:100%;">
                          <option value="fixed">Fixed (Parallax)</option>
                          <option value="scroll">Scrolls with Page</option>
                        </select>
                      </div>
                    </div>

                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
                      <div>
                        <label class="prop-label" style="font-size:0.72rem;">Position</label>
                        <select id="site-global-bg-position" style="font-size:0.75rem;width:100%;">
                          <option value="center center">Center</option>
                          <option value="top center">Top Center</option>
                          <option value="bottom center">Bottom Center</option>
                          <option value="top left">Top Left</option>
                        </select>
                      </div>
                      <div>
                        <label class="prop-label" style="font-size:0.72rem;">Repeat</label>
                        <select id="site-global-bg-repeat" style="font-size:0.75rem;width:100%;">
                          <option value="no-repeat">No Repeat</option>
                          <option value="repeat">Tile / Pattern</option>
                        </select>
                      </div>
                    </div>

                    <!-- Overlay Opacity Tint Slider -->
                    <div>
                      <div style="display:flex;justify-content:space-between;align-items:center;">
                        <label class="prop-label" style="font-size:0.72rem;margin:0;">Dark Overlay Opacity</label>
                        <span id="site-global-bg-opacity-val" style="font-size:0.72rem;color:var(--text-dim);font-family:monospace;">50%</span>
                      </div>
                      <input type="range" id="site-global-bg-opacity" min="0" max="95" step="5" value="50" style="width:100%;cursor:pointer;margin-top:4px;" />
                      <div style="font-size:0.68rem;color:var(--text-dim);margin-top:2px;">Darkens the background image so text on sections remains clear.</div>
                    </div>
                  </div>
                </div>

                <!-- Analytics & Integrations -->
                <div class="prop-group" style="margin-top: 18px; padding-top: 14px; border-top: 1px solid var(--border-subtle);">
                  <div style="font-weight: 700; font-size: 0.86rem; color: #f8fafc; margin-bottom: 10px; display: flex; align-items: center; gap: 6px;">
                    <span>📊</span> Analytics &amp; Tracking
                  </div>
                  <div style="display: flex; flex-direction: column; gap: 10px;">
                    <div>
                      <label class="prop-label" style="font-size:0.75rem;">Google Analytics (GA4) Measurement ID</label>
                      <input type="text" id="site-ga-id" placeholder="G-XXXXXXXXXX" style="font-size:0.78rem;" />
                      <div style="font-size:0.7rem; color:var(--text-dim); margin-top:3px;">Automatically injects gtag.js tracker on live pages.</div>
                    </div>
                    <div>
                      <label class="prop-label" style="font-size:0.75rem;">Meta / Facebook Pixel ID</label>
                      <input type="text" id="site-pixel-id" placeholder="e.g. 123456789012345" style="font-size:0.78rem;" />
                    </div>
                  </div>
                </div>

                <!-- Custom Global CSS -->
                <div class="prop-group" style="margin-top: 18px; padding-top: 14px; border-top: 1px solid var(--border-subtle);">
                  <div style="font-weight: 700; font-size: 0.86rem; color: #f8fafc; margin-bottom: 6px; display: flex; align-items: center; gap: 6px;">
                    <span>🎨</span> Global Custom CSS
                  </div>
                  <div style="font-size:0.72rem; color:var(--text-dim); margin-bottom: 6px;">Injected into &lt;head&gt; across all pages.</div>
                  <textarea id="site-custom-css" rows="6" placeholder="/* Custom CSS rules */&#10;.custom-glow { filter: drop-shadow(0 0 10px #6366f1); }" style="font-family: monospace; font-size: 0.75rem; width: 100%; resize: vertical; padding: 6px 8px; border-radius: 6px; border: 1px solid var(--border-subtle); background: var(--bg-deep); color: #a5f3fc; line-height: 1.4;"></textarea>
                </div>

                <!-- Code Injections -->
                <div class="prop-group" style="margin-top: 18px; padding-top: 14px; border-top: 1px solid var(--border-subtle);">
                  <div style="font-weight: 700; font-size: 0.86rem; color: #f8fafc; margin-bottom: 6px; display: flex; align-items: center; gap: 6px;">
                    <span>💻</span> Custom Scripts &amp; Code Injection
                  </div>
                  <div style="display: flex; flex-direction: column; gap: 10px;">
                    <div>
                      <label class="prop-label" style="font-size:0.75rem;">Header Code <span style="color:var(--text-dim);font-weight:400;">(before &lt;/head&gt;)</span></label>
                      <textarea id="site-header-scripts" rows="3" placeholder="<!-- External scripts, font links, or chat widgets -->" style="font-family: monospace; font-size: 0.73rem; width: 100%; resize: vertical; padding: 6px 8px; border-radius: 6px; border: 1px solid var(--border-subtle); background: var(--bg-deep); color: var(--text-main);"></textarea>
                    </div>
                    <div>
                      <label class="prop-label" style="font-size:0.75rem;">Footer Code <span style="color:var(--text-dim);font-weight:400;">(before &lt;/body&gt;)</span></label>
                      <textarea id="site-footer-scripts" rows="3" placeholder="<!-- Conversion tracking or body-end scripts -->" style="font-family: monospace; font-size: 0.73rem; width: 100%; resize: vertical; padding: 6px 8px; border-radius: 6px; border: 1px solid var(--border-subtle); background: var(--bg-deep); color: var(--text-main);"></textarea>
                    </div>
                  </div>
                </div>

                <!-- Global Copyright Notice -->
                <div class="prop-group" style="margin-top: 18px; padding-top: 14px; border-top: 1px solid var(--border-subtle);">
                  <label class="prop-label" style="font-size:0.75rem;">Global Copyright Text</label>
                  <input type="text" id="site-copyright-input" placeholder="© 2026 USPF School of Law. All rights reserved." style="font-size:0.78rem;" />
                </div>

                <!-- 24/7 Automated Decision-Tree Chatbot -->
                <div class="prop-group" style="margin-top: 18px; padding-top: 14px; border-top: 1px solid var(--border-subtle);">
                  <div style="font-weight: 700; font-size: 0.86rem; color: #f8fafc; margin-bottom: 10px; display: flex; align-items: center; justify-content: space-between;">
                    <span style="display:flex;align-items:center;gap:6px;"><span>🤖</span> 24/7 Automated Chatbot</span>
                    <span style="font-size:0.68rem;padding:2px 6px;border-radius:10px;background:rgba(16,185,129,0.15);color:#34d399;font-weight:700;">Zero-API Cost</span>
                  </div>
                  <div style="display: flex; flex-direction: column; gap: 10px;">
                    <label style="font-size: 0.82rem; color: var(--text-main); display: flex; align-items: center; gap: 8px; cursor: pointer;">
                      <input type="checkbox" id="site-chatbot-enable" style="cursor: pointer;" />
                      <span>Enable Floating Chatbot on Live Site</span>
                    </label>
                    <div>
                      <label class="prop-label" style="font-size:0.75rem;">Bot Title / Name</label>
                      <input type="text" id="site-chatbot-title" placeholder="e.g. USPF MCLE Assistant" style="font-size:0.78rem;" />
                    </div>
                    <div>
                      <label class="prop-label" style="font-size:0.75rem;">Bot Subtitle / Status</label>
                      <input type="text" id="site-chatbot-subtitle" placeholder="e.g. Automated 24/7 Guidance &amp; Inquiries" style="font-size:0.78rem;" />
                    </div>
                    <div>
                      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
                        <label class="prop-label" style="font-size:0.75rem;margin:0;">Avatar Icon / Image</label>
                        <button type="button" id="btn-pick-chatbot-avatar" class="btn btn-sm" style="font-size:0.7rem;padding:2px 7px;background:rgba(99,102,241,0.15);border:1px solid rgba(99,102,241,0.3);color:#a5b4fc;border-radius:4px;cursor:pointer;">🖼️ Media</button>
                      </div>
                      <div style="display:flex;align-items:center;gap:6px;">
                        <input type="text" id="site-chatbot-avatar" placeholder="⚖️ or assets/uploads/bot.png" style="font-size:0.78rem;flex:1;" />
                        <div id="site-chatbot-avatar-preview" style="width:28px;height:28px;border-radius:6px;background:rgba(255,255,255,0.06);border:1px solid var(--border-subtle);display:flex;align-items:center;justify-content:center;font-size:1.1rem;overflow:hidden;flex-shrink:0;">⚖️</div>
                      </div>
                      <div style="font-size:0.7rem;color:var(--text-dim);margin-top:2px;">Type an emoji or pick an image from the Media Library.</div>
                    </div>
                    <div>
                      <label class="prop-label" style="font-size:0.75rem;">Bubble Prompt</label>
                      <input type="text" id="site-chatbot-bubble" placeholder="Need help? Ask us!" style="font-size:0.78rem;" />
                    </div>
                    <button type="button" id="btn-edit-chatbot-flow" class="topbar-btn topbar-btn-sm" style="margin-top:4px;width:100%;justify-content:center;background:rgba(99,102,241,0.18);border-color:#6366f1;color:#a5b4fc;padding:6px;">
                      <span>🌳 Customize Questions &amp; Flowchart</span>
                    </button>
                  </div>
                </div>

                <!-- Admin Notification Alerts -->
                <div class="prop-group" style="margin-top: 18px; padding-top: 14px; border-top: 1px solid var(--border-subtle);">
                  <div style="font-weight: 700; font-size: 0.86rem; color: #f8fafc; margin-bottom: 8px; display: flex; align-items: center; gap: 6px;">
                    <span>🔔</span> Leads &amp; Form Notification Alerts
                  </div>
                  <div>
                    <label class="prop-label" style="font-size:0.75rem;">Admin Alert Email Address</label>
                    <input type="email" id="site-notif-email" placeholder="e.g. mcle@uspf.edu.ph" style="font-size:0.78rem;" />
                    <div style="font-size:0.7rem; color:var(--text-dim); margin-top:3px;">Receive instant email notifications when someone submits a contact form or chatbot lead.</div>
                  </div>
                </div>
              </div>

              <!-- Add-ons & Widget Plugins Panel -->
              <div id="tab-addons-panel" style="display: none; padding-bottom: 24px;">
                <div style="font-weight: 700; font-size: 1rem; margin-bottom: 14px; display: flex; align-items: center; justify-content: space-between;">
                  <span>🧩 Add-ons &amp; Plugins</span>
                  <span style="font-size: 0.72rem; color: #a5b4fc; background: rgba(99,102,241,0.15); padding: 3px 8px; border-radius: 12px; font-weight: 700;">Extensible</span>
                </div>

                <div style="display:flex;gap:8px;margin-bottom:16px;">
                  <button type="button" id="btn-open-addon-maker" class="btn btn-sm btn-primary" style="flex:1;justify-content:center;padding:8px 12px;font-size:0.8rem;font-weight:700;color:#ffffff !important;background:linear-gradient(135deg,#6366f1,#4f46e5);border:1px solid rgba(255,255,255,0.25);box-shadow:0 4px 12px rgba(99,102,241,0.35);border-radius:6px;cursor:pointer;">
                    <span style="color:#ffffff !important;font-weight:700;">✨ Create Add-On</span>
                  </button>
                  <button type="button" id="btn-upload-addon-pkg" class="btn btn-sm" style="flex:1;justify-content:center;padding:8px 12px;font-size:0.8rem;background:rgba(255,255,255,0.08);border:1px solid var(--border-subtle);color:#ffffff !important;font-weight:600;border-radius:6px;cursor:pointer;">
                    <span style="color:#ffffff !important;">📁 Install .json</span>
                  </button>
                  <input type="file" id="addon-file-picker" accept=".json" style="display:none;" />
                </div>

                <div id="installed-addons-list" style="display:flex;flex-direction:column;gap:12px;">
                  <!-- Rendered dynamically -->
                </div>
              </div>
            </div>
          </aside>

          <!-- Canvas Viewport Center -->
          <section class="builder-canvas-viewport mode-desktop" id="builder-canvas-container">
            <!-- Live Canvas Frame Rendered Here -->
          </section>

          <!-- Floating Publish Button (pinned on left side of preview canvas) -->
          <button class="floating-publish-btn" id="btn-floating-publish" title="Publish changes live to website">
            <span>🚀</span> Publish Live
          </button>
        </main>
      </div>
    `;

    this.bindTopbarActions();
    this.renderWidgetTray();
    this.initSidebarTabs();
    this.initSidebarResizer();

    // Initialize Canvas & Inspector
    const canvasContainer = document.getElementById('builder-canvas-container');
    const inspectorContainer = document.getElementById('tab-inspector-panel');

    this.canvas = new BuilderCanvas(canvasContainer, false);
    this.inspector = new InspectorPanel(inspectorContainer);

    // Auto-switch to inspector tab when an element is clicked
    state.subscribe((_, action) => {
      if (action === 'selection' && state.activeElementId) {
        this.switchSidebarTab('inspector');
      }
    });

    this.bindKeyboardShortcuts();
    this.initPageSettings();
    this.initSiteSettings();
    this.initMediaLibrary();
    this.initPagesPanel();
    this.initNotificationsHub();
    this.initAddonsHandlers();
  }

  // --------------------------------------------------------------------------
  // MEDIA LIBRARY
  // --------------------------------------------------------------------------
  initMediaLibrary() {
    // Inject modal HTML into DOM
    const modalEl = document.createElement('div');
    modalEl.id = 'media-library-modal';
    modalEl.className = 'media-modal-overlay hidden';
    modalEl.innerHTML = `
      <div class="media-modal-panel">
        <div class="media-modal-header">
          <div style="display:flex;align-items:center;gap:10px;">
            <span style="font-size:1.4rem;">🖼️</span>
            <div>
              <div style="font-weight:700;font-size:1.05rem;">Media Library</div>
              <div style="font-size:0.78rem;color:var(--text-dim);">Upload &amp; manage your site assets</div>
            </div>
          </div>
          <button class="media-modal-close" id="media-modal-close">✕</button>
        </div>

        <div class="media-upload-zone" id="media-upload-zone">
          <input type="file" id="media-file-input" multiple accept="image/*,video/mp4,video/webm,.pdf" style="display:none;" />
          <div class="media-upload-inner" id="media-upload-trigger">
            <div style="font-size:1.8rem;line-height:1;">☁️</div>
            <div style="flex:1;">
              <div style="font-weight:600;font-size:0.92rem;color:#fff;">Click to upload or drag &amp; drop files here</div>
              <div style="font-size:0.75rem;color:var(--text-dim);margin-top:2px;">Supports JPG, PNG, GIF, WebP, SVG, MP4, WebM, PDF</div>
            </div>
            <button type="button" class="topbar-btn" style="pointer-events:none;background:rgba(99,102,241,0.18);border-color:rgba(99,102,241,0.4);color:#a5b4fc;font-size:0.8rem;padding:6px 14px;">Browse Files</button>
          </div>
          <div class="media-upload-progress hidden" id="media-upload-progress">
            <div class="media-progress-bar"><div class="media-progress-fill" id="media-progress-fill"></div></div>
            <div style="font-size:0.82rem;color:var(--text-muted);margin-top:6px;" id="media-upload-status">Uploading...</div>
          </div>
        </div>

        <div class="media-library-toolbar">
          <input type="text" id="media-search" placeholder="🔍  Search assets..." class="media-search-input" />
          <span id="media-asset-count" style="font-size:0.8rem;color:var(--text-dim);">0 files</span>
        </div>

        <div class="media-grid" id="media-grid">
          <div class="media-empty-state" id="media-empty-state">
            <div style="font-size:2.5rem;margin-bottom:10px;">📂</div>
            <div style="font-weight:600;color:var(--text-muted);">No assets uploaded yet</div>
            <div style="font-size:0.82rem;color:var(--text-dim);margin-top:4px;">Upload images and files using the zone above</div>
          </div>
        </div>

        <div class="media-modal-footer">
          <div style="display:flex;align-items:center;gap:12px;flex:1;min-width:0;">
            <div id="media-selected-info" style="font-size:0.85rem;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">No asset selected</div>
            <button class="topbar-btn" id="media-btn-copy" style="display:none;padding:5px 12px;font-size:0.78rem;background:rgba(99,102,241,0.15);border-color:rgba(99,102,241,0.3);color:#a5b4fc;" title="Copy file URL to clipboard">📋 Copy URL</button>
          </div>
          <div style="display:flex;gap:10px;">
            <button class="topbar-btn" id="media-btn-cancel">Cancel</button>
            <button class="topbar-btn topbar-btn-publish" id="media-btn-use" disabled>Use Selected ✓</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modalEl);

    let _selectCallback = null;
    let _selectedAsset = null;
    let _allAssets = [];

    // Helper to update selection UI
    const setSelection = (asset) => {
      _selectedAsset = asset;
      const copyBtn = document.getElementById('media-btn-copy');
      const selectedInfo = document.getElementById('media-selected-info');
      if (asset) {
        selectedInfo.innerHTML = `Selected: <strong style="color:#ffffff;">${asset.name}</strong> <span style="color:var(--text-dim);font-size:0.78rem;">(${(asset.size / 1024).toFixed(1)} KB)</span>`;
        if (copyBtn) copyBtn.style.display = 'inline-flex';
        document.getElementById('media-btn-use').disabled = false;
      } else {
        selectedInfo.textContent = 'No asset selected';
        if (copyBtn) copyBtn.style.display = 'none';
        document.getElementById('media-btn-use').disabled = true;
      }
    };

    // Expose global opener function (called by inspector image-picker fields)
    window.openMediaLibrary = (callback) => {
      _selectCallback = callback;
      setSelection(null);
      modalEl.classList.remove('hidden');
      this.loadAssets(_allAssets, '');
      this.fetchAssets().then(assets => {
        _allAssets = assets;
        this.renderAssetGrid(assets, '', (asset) => {
          setSelection(asset);
        });
      });
    };

    this.openMediaModal = (callback) => window.openMediaLibrary(callback);

    // Topbar button also opens library (browse mode, no selection callback)
    document.getElementById('btn-media')?.addEventListener('click', () => {
      window.openMediaLibrary(null);
    });

    // Close actions
    const closeModal = () => {
      modalEl.classList.add('hidden');
      _selectCallback = null;
      _selectedAsset = null;
    };
    document.getElementById('media-modal-close').addEventListener('click', closeModal);
    document.getElementById('media-btn-cancel').addEventListener('click', closeModal);
    modalEl.addEventListener('click', (e) => { if (e.target === modalEl) closeModal(); });

    // Use selected button
    document.getElementById('media-btn-use').addEventListener('click', () => {
      if (_selectedAsset && _selectCallback) {
        _selectCallback(_selectedAsset.url);
      }
      closeModal();
    });

    // Copy selected URL button
    document.getElementById('media-btn-copy')?.addEventListener('click', async () => {
      if (_selectedAsset?.url) {
        const btn = document.getElementById('media-btn-copy');
        try {
          await navigator.clipboard.writeText(_selectedAsset.url);
          btn.innerHTML = '✅ Copied!';
          setTimeout(() => { btn.innerHTML = '📋 Copy URL'; }, 2000);
        } catch {
          prompt('Copy asset URL:', _selectedAsset.url);
        }
      }
    });

    // Search filter
    document.getElementById('media-search').addEventListener('input', (e) => {
      this.renderAssetGrid(_allAssets, e.target.value, (asset) => {
        setSelection(asset);
      });
    });

    // Helper for instant media grid refresh after upload/delete
    const refreshMediaGrid = async () => {
      const assets = await this.fetchAssets();
      _allAssets = assets;
      const searchVal = document.getElementById('media-search')?.value || '';
      this.renderAssetGrid(assets, searchVal, (asset) => {
        setSelection(asset);
      });
      if (assets.length > 0) {
        setSelection(assets[0]);
      } else {
        setSelection(null);
      }
    };

    // File upload via click
    document.getElementById('media-upload-trigger').addEventListener('click', () => {
      document.getElementById('media-file-input').click();
    });
    document.getElementById('media-file-input').addEventListener('change', (e) => {
      const files = Array.from(e.target.files);
      if (files.length === 0) return;
      this.uploadFiles(files, _allAssets, () => {
        refreshMediaGrid();
      });
      e.target.value = ''; // Reset input so same file can be re-selected
    });

    // Drag and drop upload
    const dropZone = document.getElementById('media-upload-zone');
    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.classList.remove('drag-over');
      const files = Array.from(e.dataTransfer.files);
      if (files.length === 0) return;
      this.uploadFiles(files, _allAssets, () => {
        refreshMediaGrid();
      });
    });
  }

  async fetchAssets() {
    try {
      const res = await fetch('api.php?action=list_assets');
      const data = await res.json();
      return data.assets || [];
    } catch {
      return [];
    }
  }

  loadAssets(assets, query) {
    // Placeholder until actual fetch resolves
    document.getElementById('media-asset-count').textContent = `${assets.length} files`;
  }

  renderAssetGrid(assets, query, onSelect) {
    const grid = document.getElementById('media-grid');
    const emptyState = document.getElementById('media-empty-state');
    const filtered = query
      ? assets.filter(a => a.name.toLowerCase().includes(query.toLowerCase()))
      : assets;

    document.getElementById('media-asset-count').textContent = `${filtered.length} file${filtered.length !== 1 ? 's' : ''}`;

    // Clear grid but keep empty state element
    Array.from(grid.children).forEach(c => { if (c.id !== 'media-empty-state') c.remove(); });

    if (filtered.length === 0) {
      emptyState.style.display = 'flex';
      return;
    }
    emptyState.style.display = 'none';

    const imageExts = ['jpg','jpeg','png','gif','webp','svg'];
    filtered.forEach(asset => {
      const card = document.createElement('div');
      card.className = 'media-asset-card';
      card.dataset.url = asset.url;

      const isImage = imageExts.includes(asset.ext);
      const thumb = isImage
        ? `<img src="${asset.url}" alt="${asset.name}" loading="lazy" />`
        : `<div class="media-asset-icon">${asset.ext === 'pdf' ? '📄' : asset.ext.includes('mp4') || asset.ext.includes('webm') ? '🎬' : '📁'}</div>`;

      const sizekb = (asset.size / 1024).toFixed(1);
      card.innerHTML = `
        <button class="media-asset-copy" data-url="${asset.url}" title="Copy file URL">📋</button>
        <button class="media-asset-delete" data-name="${asset.name}" title="Delete asset">🗑</button>
        <div class="media-asset-thumb">${thumb}</div>
        <div class="media-asset-info">
          <div class="media-asset-name" title="${asset.name}">${asset.name}</div>
          <div class="media-asset-meta">${sizekb} KB · ${asset.ext.toUpperCase()}</div>
        </div>
      `;

      card.addEventListener('click', (e) => {
        if (e.target.closest('.media-asset-delete') || e.target.closest('.media-asset-copy')) return;
        document.querySelectorAll('.media-asset-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        onSelect(asset);
      });

      card.addEventListener('dblclick', (e) => {
        if (e.target.closest('.media-asset-delete') || e.target.closest('.media-asset-copy')) return;
        onSelect(asset);
        document.getElementById('media-btn-use')?.click();
      });

      card.querySelector('.media-asset-copy').addEventListener('click', async (e) => {
        e.stopPropagation();
        const btn = e.currentTarget;
        try {
          await navigator.clipboard.writeText(asset.url);
          btn.innerHTML = '✓';
          btn.style.color = '#34d399';
          setTimeout(() => { btn.innerHTML = '📋'; btn.style.color = ''; }, 1600);
        } catch {
          prompt('Copy asset URL:', asset.url);
        }
      });

      card.querySelector('.media-asset-delete').addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!confirm(`Delete "${asset.name}"?`)) return;
        await fetch('api.php?action=delete_asset', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: asset.name })
        });
        this.fetchAssets().then(assets2 => {
          this.renderAssetGrid(assets2, document.getElementById('media-search').value, onSelect);
        });
      });

      grid.appendChild(card);
    });
  }

  // --------------------------------------------------------------------------
  // PAGES MANAGER
  // --------------------------------------------------------------------------
  initPagesPanel() {
    // Re-render on any page-related state changes
    state.subscribe((_, action) => {
      if (['pageAdded','pageDeleted','pageDuplicated','pageReordered','pageSwitched','pageMeta','serverSync','import'].includes(action)) {
        const panel = document.getElementById('tab-pages-panel');
        if (panel && panel.style.display !== 'none') this.renderPagesPanel();
      }
    });
  }

  renderPagesPanel() {
    const panel = document.getElementById('tab-pages-panel');
    if (!panel) return;

    const pagesHtml = state.pages.map((page, idx) => {
      const isActive = page.id === state.currentPageId;
      const isHome   = idx === 0;
      return `
        <div class="page-item ${isActive ? 'active' : ''}" data-page-id="${page.id}" data-index="${idx}" draggable="true">
          <div class="page-item-drag">⠿</div>
          <div class="page-item-info" style="flex:1;min-width:0;">
            <div class="page-item-title">${page.title}</div>
            <div class="page-item-slug">${isHome ? '(homepage)' : page.slug + '.html'}</div>
          </div>
          <div class="page-item-actions">
            <button class="page-action-btn" data-action="duplicate" data-page-id="${page.id}" title="Duplicate page">❐</button>
            ${!isHome ? `<button class="page-action-btn danger" data-action="delete" data-page-id="${page.id}" title="Delete page">🗑</button>` : ''}
          </div>
        </div>
      `;
    }).join('');

    panel.innerHTML = `
      <div style="padding: 14px 14px 0; font-weight: 700; font-size: 0.95rem; display:flex; align-items:center; justify-content:space-between; margin-bottom:10px;">
        <span>📄 Pages <span style="font-size:0.75rem;color:var(--text-dim);font-weight:400;">${state.pages.length} page${state.pages.length !== 1 ? 's' : ''}</span></span>
      </div>
      <div id="pages-list">${pagesHtml}</div>
      <div style="padding: 12px 14px; border-top: 1px solid var(--border-subtle); margin-top: 10px;">
        <button class="topbar-btn" id="btn-add-page" style="width:100%; justify-content:center;">
          <span>➕</span> Add New Page
        </button>
      </div>
    `;

    // Click page to switch
    panel.querySelectorAll('.page-item').forEach(item => {
      item.addEventListener('click', (e) => {
        if (e.target.closest('.page-action-btn')) return;
        state.switchPage(item.dataset.pageId);
        this.renderPagesPanel();
        this.canvas.showToast(`Switched to: ${state.currentPage.title}`, 'info');
      });
    });

    // Page actions: duplicate / delete
    panel.querySelectorAll('.page-action-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = btn.dataset.action;
        const pageId = btn.dataset.pageId;
        if (action === 'duplicate') {
          const clone = state.duplicatePage(pageId);
          this.canvas.showToast(`Duplicated: ${clone.title}`, 'success');
        } else if (action === 'delete') {
          const page = state.pages.find(p => p.id === pageId);
          if (confirm(`Delete page "${page?.title}"? This cannot be undone.`)) {
            state.deletePage(pageId);
            this.canvas.showToast('Page deleted', 'info');
          }
        }
        this.renderPagesPanel();
      });
    });

    // Add page button
    panel.querySelector('#btn-add-page')?.addEventListener('click', () => {
      const title = prompt('New page title:', 'About');
      if (!title) return;
      const slug  = prompt('URL slug (e.g. about):', title.toLowerCase().replace(/\s+/g, '-'));
      state.addPage(title, slug || title);
      this.canvas.showToast(`Page created: ${title}`, 'success');
      this.renderPagesPanel();
    });

    // Drag-to-reorder
    let dragFrom = null;
    panel.querySelectorAll('.page-item').forEach(item => {
      item.addEventListener('dragstart', () => { dragFrom = parseInt(item.dataset.index); item.style.opacity = '0.5'; });
      item.addEventListener('dragend',   () => { item.style.opacity = ''; });
      item.addEventListener('dragover',  (e) => { e.preventDefault(); item.classList.add('drag-over-page'); });
      item.addEventListener('dragleave', () => item.classList.remove('drag-over-page'));
      item.addEventListener('drop', (e) => {
        e.preventDefault();
        item.classList.remove('drag-over-page');
        const toIdx = parseInt(item.dataset.index);
        if (dragFrom !== null && dragFrom !== toIdx) {
          state.reorderPages(dragFrom, toIdx);
          this.renderPagesPanel();
        }
        dragFrom = null;
      });
    });
  }

  /**
   * Upload files with frontend duplicate detection.
   * @param {File[]} files - Files to upload
   * @param {Array} existingAssets - Currently loaded asset list (for duplicate check)
   * @param {Function} onComplete - Called after all uploads finish
   */
  async uploadFiles(files, existingAssets = [], onComplete) {
    const progressBar = document.getElementById('media-upload-progress');
    const progressFill = document.getElementById('media-progress-fill');
    const statusText = document.getElementById('media-upload-status');
    progressBar.classList.remove('hidden');

    // Build a Set of existing sanitized filenames for fast lookup
    const existingNames = new Set(
      (existingAssets || []).map(a => a.name?.toLowerCase())
    );

    let uploaded = 0;
    let skipped = 0;
    const total = files.length;

    for (const file of files) {
      // Sanitize filename the same way the backend does
      const ext = file.name.includes('.') ? file.name.split('.').pop().toLowerCase() : '';
      const baseName = file.name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_\-]/g, '_');
      const sanitizedName = ext ? `${baseName}.${ext}` : baseName;

      let overwrite = false;

      // Check for duplicate
      if (existingNames.has(sanitizedName.toLowerCase())) {
        const action = await this._showDuplicateDialog(file.name, sanitizedName);
        if (action === 'skip') {
          skipped++;
          progressFill.style.width = `${((uploaded + skipped) / total) * 100}%`;
          statusText.textContent = `Skipped ${file.name}`;
          continue;
        }
        overwrite = (action === 'replace');
      }

      statusText.textContent = `Uploading ${file.name}...`;
      const formData = new FormData();
      formData.append('file', file);
      if (overwrite) {
        formData.append('overwrite', '1');
      }
      try {
        const res = await fetch('api.php?action=upload', { method: 'POST', body: formData });
        const result = await res.json();
        if (result.success) {
          uploaded++;
          // Add the new name so subsequent files in the same batch also detect it
          existingNames.add((result.name || sanitizedName).toLowerCase());
        } else {
          console.error('Upload rejected:', result.error);
        }
        progressFill.style.width = `${((uploaded + skipped) / total) * 100}%`;
      } catch (err) {
        console.error('Upload failed:', err);
      }
    }

    const parts = [];
    if (uploaded > 0) parts.push(`${uploaded} uploaded`);
    if (skipped > 0) parts.push(`${skipped} skipped`);
    if (uploaded === 0 && skipped === 0) {
      statusText.textContent = `❌ Upload failed. Please check file type and size.`;
    } else {
      statusText.textContent = `✅ ${parts.join(', ')}!`;
    }
    setTimeout(() => {
      progressBar.classList.add('hidden');
      progressFill.style.width = '0%';
    }, 2500);
    onComplete();
  }

  /**
   * Shows a styled duplicate-file dialog. Returns 'replace', 'rename', or 'skip'.
   */
  _showDuplicateDialog(originalName, sanitizedName) {
    return new Promise((resolve) => {
      // Remove any existing dialog first
      document.getElementById('media-dup-dialog')?.remove();

      const overlay = document.createElement('div');
      overlay.id = 'media-dup-dialog';
      overlay.style.cssText = `
        position: fixed; inset: 0; z-index: 100001;
        background: rgba(0,0,0,0.55); backdrop-filter: blur(6px);
        display: flex; align-items: center; justify-content: center;
        animation: fadeIn 0.15s ease;
      `;
      overlay.innerHTML = `
        <div style="
          background: linear-gradient(145deg, #1e1b4b, #1a1a2e);
          border: 1px solid rgba(99,102,241,0.35);
          border-radius: 16px; padding: 28px 32px; max-width: 420px; width: 90%;
          box-shadow: 0 20px 60px rgba(0,0,0,0.5), 0 0 40px rgba(99,102,241,0.15);
          font-family: 'Inter', system-ui, sans-serif; color: #e2e8f0;
        ">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;">
            <span style="font-size:1.5rem;">⚠️</span>
            <span style="font-weight:700;font-size:1.05rem;color:#fbbf24;">Duplicate File Detected</span>
          </div>
          <div style="font-size:0.88rem;color:#94a3b8;margin-bottom:6px;">
            A file named <strong style="color:#a5b4fc;">${sanitizedName}</strong> already exists in your Media Library.
          </div>
          <div style="font-size:0.82rem;color:#64748b;margin-bottom:20px;">
            Original: ${originalName}
          </div>
          <div style="display:flex;gap:10px;flex-wrap:wrap;">
            <button id="dup-btn-replace" style="
              flex:1; padding:10px 16px; border-radius:10px; border:1px solid rgba(239,68,68,0.4);
              background:rgba(239,68,68,0.15); color:#fca5a5; font-weight:600; font-size:0.85rem;
              cursor:pointer; transition:all 0.2s;
            " onmouseover="this.style.background='rgba(239,68,68,0.3)'" onmouseout="this.style.background='rgba(239,68,68,0.15)'">
              🔄 Replace
            </button>
            <button id="dup-btn-rename" style="
              flex:1; padding:10px 16px; border-radius:10px; border:1px solid rgba(99,102,241,0.4);
              background:rgba(99,102,241,0.15); color:#a5b4fc; font-weight:600; font-size:0.85rem;
              cursor:pointer; transition:all 0.2s;
            " onmouseover="this.style.background='rgba(99,102,241,0.3)'" onmouseout="this.style.background='rgba(99,102,241,0.15)'">
              📝 Keep Both
            </button>
            <button id="dup-btn-skip" style="
              flex:1; padding:10px 16px; border-radius:10px; border:1px solid rgba(100,116,139,0.4);
              background:rgba(100,116,139,0.12); color:#94a3b8; font-weight:600; font-size:0.85rem;
              cursor:pointer; transition:all 0.2s;
            " onmouseover="this.style.background='rgba(100,116,139,0.25)'" onmouseout="this.style.background='rgba(100,116,139,0.12)'">
              ⏭ Skip
            </button>
          </div>
          <div style="font-size:0.72rem;color:#475569;margin-top:12px;text-align:center;">
            Replace overwrites the existing file · Keep Both saves with an incremented name
          </div>
        </div>
      `;
      document.body.appendChild(overlay);

      const cleanup = (result) => {
        overlay.remove();
        resolve(result);
      };

      document.getElementById('dup-btn-replace').addEventListener('click', () => cleanup('replace'));
      document.getElementById('dup-btn-rename').addEventListener('click', () => cleanup('rename'));
      document.getElementById('dup-btn-skip').addEventListener('click', () => cleanup('skip'));
    });
  }

  // Render Left Widget Tray
  renderWidgetTray() {
    const container = document.getElementById('widgets-list-container');
    if (!container) return;

    const categories = {
      layout: { title: 'Layout & Structure', items: [] },
      content: { title: 'Content & Messaging', items: [] },
      media: { title: 'Media & Interactive', items: [] },
      addons: { title: '🧩 Add-ons & Plugins', items: [] }
    };

    Object.entries(WIDGET_REGISTRY).forEach(([key, w]) => {
      let catKey = w.category;
      if (w.isAddon || catKey === 'addons') {
        catKey = 'addons';
      }
      const cat = categories[catKey] || categories.content;
      cat.items.push({ key, ...w });
    });

    let html = '';
    Object.values(categories).forEach((cat) => {
      if (cat.items.length === 0) return;
      html += `<div class="widget-category-title">${cat.title}</div>`;
      html += `<div class="widget-grid" style="margin-bottom: 16px;">`;
      cat.items.forEach((item) => {
        html += `
          <div class="widget-card ${item.isAddon ? 'is-addon-widget' : ''}" data-widget-type="${item.key}" draggable="true" title="${item.description || ''}">
            <div class="widget-card-icon">${item.icon || '🧩'}</div>
            <div class="widget-card-name">
              <span>${item.name}</span>
              ${item.isAddon ? '<span style="font-size:0.62rem;background:rgba(99,102,241,0.25);color:#a5b4fc;padding:1px 5px;border-radius:4px;margin-left:4px;font-weight:700;">Add-on</span>' : ''}
            </div>
          </div>
        `;
      });
      html += `</div>`;
    });

    container.innerHTML = html;

    // Click or Drag to add widget to page
    container.querySelectorAll('.widget-card').forEach((card) => {
      card.addEventListener('click', () => {
        const type = card.getAttribute('data-widget-type');
        state.addSection(type);
        this.canvas.showToast(`Added ${WIDGET_REGISTRY[type]?.name || type}`, 'success');
      });

      card.addEventListener('dragstart', (e) => {
        const type = card.getAttribute('data-widget-type');
        e.dataTransfer.setData('text/plain', type);
        e.dataTransfer.setData('application/x-widget-type', type);
        e.dataTransfer.effectAllowed = 'copy';
        window._draggedWidgetType = type;
        window._draggedSectionId = null;
        card.classList.add('is-dragging');
        document.body.classList.add('builder-is-dragging');
      });

      card.addEventListener('dragend', () => {
        card.classList.remove('is-dragging');
        document.body.classList.remove('builder-is-dragging');
        window._draggedWidgetType = null;
        document.querySelectorAll('.drop-target-top, .drop-target-bottom, .is-active').forEach((el) => {
          el.classList.remove('drop-target-top', 'drop-target-bottom', 'is-active');
        });
      });
    });

    // Realtime search filtering
    const searchInput = document.getElementById('widget-search');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase().trim();
        container.querySelectorAll('.widget-card').forEach((card) => {
          const name = card.querySelector('.widget-card-name').textContent.toLowerCase();
          card.style.display = name.includes(query) ? 'flex' : 'none';
        });
      });
    }
  }

  // Sidebar Tab Switching with Slidable Nav & Auto-Scroll
  initSidebarTabs() {
    const tabsContainer = document.getElementById('sidebar-tabs') || document.querySelector('.sidebar-tabs');
    const prevArrow = document.getElementById('tab-arrow-prev');
    const nextArrow = document.getElementById('tab-arrow-next');
    const tabs = document.querySelectorAll('.sidebar-tab-btn');

    tabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        this.switchSidebarTab(tab.getAttribute('data-side-tab'));
      });
    });

    const updateArrowState = () => {
      if (!tabsContainer || !prevArrow || !nextArrow) return;
      const maxScroll = Math.max(0, tabsContainer.scrollWidth - tabsContainer.clientWidth);
      const hasOverflow = maxScroll > 4;
      prevArrow.style.display = hasOverflow ? 'flex' : 'none';
      nextArrow.style.display = hasOverflow ? 'flex' : 'none';
      prevArrow.disabled = tabsContainer.scrollLeft <= 2;
      nextArrow.disabled = tabsContainer.scrollLeft >= maxScroll - 2;
    };

    if (prevArrow && tabsContainer) {
      prevArrow.addEventListener('click', (e) => {
        e.preventDefault();
        tabsContainer.scrollBy({ left: -140, behavior: 'smooth' });
      });
    }

    if (nextArrow && tabsContainer) {
      nextArrow.addEventListener('click', (e) => {
        e.preventDefault();
        tabsContainer.scrollBy({ left: 140, behavior: 'smooth' });
      });
    }

    if (tabsContainer) {
      // Horizontal mouse wheel scrolling over tabs
      tabsContainer.addEventListener('wheel', (e) => {
        if (e.deltaY !== 0) {
          e.preventDefault();
          tabsContainer.scrollLeft += e.deltaY;
          updateArrowState();
        }
      }, { passive: false });

      tabsContainer.addEventListener('scroll', updateArrowState, { passive: true });
      window.addEventListener('resize', updateArrowState);
      setTimeout(updateArrowState, 200);
    }
  }

  switchSidebarTab(tabName) {
    document.querySelectorAll('.sidebar-tab-btn').forEach((b) => {
      const isTarget = b.getAttribute('data-side-tab') === tabName;
      b.classList.toggle('active', isTarget);
      if (isTarget) {
        b.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
      }
    });

    document.getElementById('tab-widgets-panel').style.display     = tabName === 'widgets'      ? 'block' : 'none';
    document.getElementById('tab-inspector-panel').style.display   = tabName === 'inspector'    ? 'block' : 'none';
    document.getElementById('tab-pages-panel').style.display       = tabName === 'pages'        ? 'block' : 'none';
    document.getElementById('tab-settings-panel').style.display    = tabName === 'settings'     ? 'block' : 'none';
    const sitePanel = document.getElementById('tab-sitesettings-panel');
    if (sitePanel) sitePanel.style.display                         = tabName === 'sitesettings' ? 'block' : 'none';
    const addonsPanel = document.getElementById('tab-addons-panel');
    if (addonsPanel) addonsPanel.style.display                     = tabName === 'addons'       ? 'block' : 'none';

    if (tabName === 'pages') this.renderPagesPanel();
    if (tabName === 'sitesettings') this.syncSiteSettingsInputs();
    if (tabName === 'addons') this.renderAddonsPanel();

    const tabsContainer = document.getElementById('sidebar-tabs');
    if (tabsContainer) {
      tabsContainer.dispatchEvent(new Event('scroll'));
    }
  }

  // --------------------------------------------------------------------------
  // DRAGGABLE RESIZABLE SIDEBAR
  // --------------------------------------------------------------------------
  initSidebarResizer() {
    const sidebar = document.getElementById('builder-sidebar');
    const resizer = document.getElementById('sidebar-resizer');
    const toggleBtn = document.getElementById('sidebar-resize-toggle');
    if (!sidebar || !resizer || !toggleBtn) return;

    // Restore saved width and resize state from localStorage
    const savedWidth = localStorage.getItem('aether_sidebar_width');
    if (savedWidth) {
      const w = parseInt(savedWidth, 10);
      if (!isNaN(w) && w >= 260 && w <= 750) {
        sidebar.style.width = `${w}px`;
        document.documentElement.style.setProperty('--sidebar-width', `${w}px`);
      }
    } else {
      sidebar.style.width = '380px';
      document.documentElement.style.setProperty('--sidebar-width', '380px');
    }

    // Restore resize enabled/disabled state
    const resizeEnabled = localStorage.getItem('aether_sidebar_resizable') !== 'false';
    if (!resizeEnabled) {
      document.body.classList.add('sidebar-resizing-disabled');
      toggleBtn.textContent = '🔒';
    } else {
      toggleBtn.textContent = '🔓';
    }

    // Helper to update toggle button icon
    const updateToggleIcon = () => {
      const disabled = document.body.classList.contains('sidebar-resizing-disabled');
      toggleBtn.textContent = disabled ? '🔒' : '🔓';
    };

    // Toggle button click handler
    toggleBtn.addEventListener('click', () => {
      document.body.classList.toggle('sidebar-resizing-disabled');
      const disabled = document.body.classList.contains('sidebar-resizing-disabled');
      localStorage.setItem('aether_sidebar_resizable', disabled ? 'false' : 'true');
      updateToggleIcon();
    });

    // Restore saved width from localStorage or comfortable default
    // (already done above)

    let isDragging = false;
    let startX = 0;
    let startWidth = 380;

    resizer.addEventListener('mousedown', (e) => {
      if (document.body.classList.contains('sidebar-resizing-disabled')) return;
      isDragging = true;
      startX = e.clientX;
      startWidth = sidebar.getBoundingClientRect().width;
      document.body.classList.add('is-resizing-sidebar');
      resizer.classList.add('active');
      e.preventDefault();
    });

    window.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const delta = e.clientX - startX;
      const maxWidth = Math.min(680, Math.floor(window.innerWidth * 0.6));
      const newWidth = Math.max(260, Math.min(maxWidth, Math.round(startWidth + delta)));
      sidebar.style.width = `${newWidth}px`;
      document.documentElement.style.setProperty('--sidebar-width', `${newWidth}px`);
    });

    window.addEventListener('mouseup', () => {
      if (!isDragging) return;
      isDragging = false;
      document.body.classList.remove('is-resizing-sidebar');
      resizer.classList.remove('active');
      const finalWidth = Math.round(sidebar.getBoundingClientRect().width);
      localStorage.setItem('aether_sidebar_width', finalWidth);
      const tabsContainer = document.getElementById('sidebar-tabs');
      if (tabsContainer) {
        tabsContainer.dispatchEvent(new Event('scroll'));
      }
    });

    // Double-click – only cycle widths when resizing is enabled
    resizer.addEventListener('dblclick', () => {
      if (document.body.classList.contains('sidebar-resizing-disabled')) return;
      const current = sidebar.getBoundingClientRect().width;
      let nextWidth = 420;
      if (current < 360) nextWidth = 420;
      else if (current < 460) nextWidth = 500;
      else nextWidth = 320;

      sidebar.style.width = `${nextWidth}px`;
      document.documentElement.style.setProperty('--sidebar-width', `${nextWidth}px`);
      localStorage.setItem('aether_sidebar_width', nextWidth);
      const tabsContainer = document.getElementById('sidebar-tabs');
      if (tabsContainer) {
        tabsContainer.dispatchEvent(new Event('scroll'));
      }
    });

  }

  // --------------------------------------------------------------------------
  // ADD-ONS & PLUGINS PANEL WIRING
  // --------------------------------------------------------------------------
  initAddonsHandlers() {
    const btnNew = document.getElementById('btn-open-addon-maker');
    if (btnNew) {
      btnNew.addEventListener('click', () => {
        AddonMaker.open(null, (pkg) => {
          this.renderAddonsPanel();
          this.renderWidgetTray();
          this.canvas.render();
          this.canvas.showToast(`Installed "${pkg.name}" into Add-ons!`, 'success');
        });
      });
    }

    const btnUpload = document.getElementById('btn-upload-addon-pkg');
    const filePicker = document.getElementById('addon-file-picker');
    if (btnUpload && filePicker) {
      btnUpload.addEventListener('click', () => filePicker.click());
      filePicker.addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
          try {
            const data = JSON.parse(ev.target.result);
            const installed = addonManager.installAddon(data);
            this.renderAddonsPanel();
            this.renderWidgetTray();
            this.canvas.render();
            this.canvas.showToast(`Successfully installed ${installed.name}!`, 'success');
          } catch(err) {
            alert('Failed to install add-on package: ' + err.message);
          }
          filePicker.value = '';
        };
        reader.readAsText(file);
      });
    }
  }

  renderAddonsPanel() {
    const listContainer = document.getElementById('installed-addons-list');
    if (!listContainer) return;

    const addons = addonManager.addons || [];
    if (addons.length === 0) {
      listContainer.innerHTML = `
        <div style="text-align:center;padding:32px 14px;color:var(--text-dim);font-size:0.85rem;background:rgba(255,255,255,0.02);border:1px dashed var(--border-subtle);border-radius:10px;">
          <div style="font-size:2rem;margin-bottom:8px;">🧩</div>
          <div style="font-weight:600;color:#f1f5f9;margin-bottom:4px;">No Custom Add-ons Installed</div>
          <div>Click "✨ Create Add-On" to build a new widget or install a .json package.</div>
        </div>
      `;
      return;
    }

    listContainer.innerHTML = addons.map((addon) => {
      const isEnabled = addon.enabled !== false;
      return `
        <div class="addon-installed-card" data-addon-id="${addon.id}" style="padding:14px;background:rgba(255,255,255,0.03);border:1px solid ${isEnabled ? 'rgba(99,102,241,0.3)' : 'var(--border-subtle)'};border-radius:10px;display:flex;flex-direction:column;gap:10px;">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;">
            <div style="display:flex;align-items:center;gap:10px;">
              <span style="font-size:1.4rem;padding:6px;background:rgba(255,255,255,0.06);border-radius:8px;">${addon.icon || '🧩'}</span>
              <div>
                <div style="font-weight:700;font-size:0.9rem;color:#ffffff;display:flex;align-items:center;gap:6px;">
                  <span>${addon.name}</span>
                  <span style="font-size:0.65rem;padding:1px 6px;border-radius:10px;background:rgba(255,255,255,0.08);color:var(--text-dim);font-weight:500;">v${addon.version || '1.0.0'}</span>
                </div>
                <div style="font-size:0.73rem;color:var(--text-dim);margin-top:2px;">${addon.author || 'Custom'} &bull; <code style="color:#a5b4fc;">${addon.id}</code></div>
              </div>
            </div>
            <label style="position:relative;display:inline-block;width:38px;height:20px;margin:0;cursor:pointer;">
              <input type="checkbox" class="toggle-addon-switch" ${isEnabled ? 'checked' : ''} style="opacity:0;width:0;height:0;" />
              <span style="position:absolute;cursor:pointer;top:0;left:0;right:0;bottom:0;background-color:${isEnabled ? '#6366f1' : '#334155'};transition:.2s;border-radius:20px;">
                <span style="position:absolute;content:'';height:14px;width:14px;left:3px;bottom:3px;background-color:white;transition:.2s;border-radius:50%;transform:${isEnabled ? 'translateX(18px)' : 'none'};"></span>
              </span>
            </label>
          </div>

          ${addon.description ? `<div style="font-size:0.78rem;color:var(--text-muted);line-height:1.4;">${addon.description}</div>` : ''}

          <div style="display:flex;align-items:center;justify-content:space-between;padding-top:8px;border-top:1px solid rgba(255,255,255,0.06);font-size:0.74rem;">
            <div style="display:flex;gap:6px;">
              <button type="button" class="btn btn-sm btn-edit-addon" style="padding:3px 8px;font-size:0.72rem;background:rgba(255,255,255,0.06);color:#e2e8f0;border:1px solid var(--border-subtle);">
                ✏️ Edit
              </button>
              <button type="button" class="btn btn-sm btn-export-addon" style="padding:3px 8px;font-size:0.72rem;background:rgba(255,255,255,0.06);color:#e2e8f0;border:1px solid var(--border-subtle);">
                📦 Export
              </button>
            </div>
            <button type="button" class="tool-icon-btn btn-delete-addon" style="color:#f87171;padding:3px 6px;" title="Uninstall Add-on">
              🗑️
            </button>
          </div>
        </div>
      `;
    }).join('');

    // Wire actions
    listContainer.querySelectorAll('.addon-installed-card').forEach((card) => {
      const id = card.getAttribute('data-addon-id');
      const addon = addons.find(a => a.id === id);

      card.querySelector('.toggle-addon-switch').addEventListener('change', (e) => {
        addonManager.toggleAddon(id, e.target.checked);
        this.renderWidgetTray();
        this.canvas.render();
        this.canvas.showToast(`${addon.name} ${e.target.checked ? 'enabled' : 'disabled'}`, 'info');
        this.renderAddonsPanel();
      });

      card.querySelector('.btn-edit-addon').addEventListener('click', () => {
        AddonMaker.open(addon, () => {
          this.renderAddonsPanel();
          this.renderWidgetTray();
          this.canvas.render();
          this.canvas.showToast(`Updated ${addon.name}`, 'success');
        });
      });

      card.querySelector('.btn-export-addon').addEventListener('click', () => {
        addonManager.exportAddon(id);
      });

      card.querySelector('.btn-delete-addon').addEventListener('click', () => {
        if (confirm(`Are you sure you want to uninstall and remove "${addon.name}"?`)) {
          addonManager.deleteAddon(id);
          this.renderWidgetTray();
          this.canvas.render();
          this.canvas.showToast(`Uninstalled ${addon.name}`, 'info');
          this.renderAddonsPanel();
        }
      });
    });
  }

  // --------------------------------------------------------------------------
  // PAGE SETTINGS & THEME ENGINE WIRING
  // --------------------------------------------------------------------------
  initPageSettings() {
    const titleInput = document.getElementById('page-title-input');
    const themeSelect = document.getElementById('theme-preset-select');
    const swatchList = document.getElementById('theme-swatch-list');
    const fontSelect = document.getElementById('font-family-select');

    if (!themeSelect || !fontSelect) return;

    // Populate theme preset options
    themeSelect.innerHTML = Object.values(THEME_PRESETS)
      .map((p) => `<option value="${p.id}">${p.name}</option>`)
      .join('');

    // Populate visual swatch cards
    if (swatchList) {
      swatchList.innerHTML = Object.values(THEME_PRESETS)
        .map((p) => {
          const primary = p.vars['--primary'] || '#6366f1';
          const secondary = p.vars['--secondary'] || '#ec4899';
          const accent = p.vars['--accent'] || '#06b6d4';
          const isActive = (state.pageSettings.themePreset || 'dark-neon') === p.id;
          return `
            <div class="theme-swatch-card ${isActive ? 'active' : ''}" data-theme-id="${p.id}" title="Click to apply ${p.name}">
              <div class="theme-card-info">
                <div class="theme-card-name">${p.name}</div>
                <div class="theme-card-desc">${p.accentName || ''}</div>
              </div>
              <div class="theme-card-colors">
                <span class="theme-color-dot" style="background: ${primary};"></span>
                <span class="theme-color-dot" style="background: ${secondary};"></span>
                <span class="theme-color-dot" style="background: ${accent};"></span>
              </div>
            </div>
          `;
        })
        .join('');

      // Add click listeners to swatch cards
      swatchList.querySelectorAll('.theme-swatch-card').forEach((card) => {
        card.addEventListener('click', () => {
          const themeId = card.getAttribute('data-theme-id');
          this.applyThemeSelection(themeId);
        });
      });
    }

    // Populate fonts
    fontSelect.innerHTML = AVAILABLE_FONTS.map(
      (f) => `<option value="${f.id}">${f.name}</option>`
    ).join('');

    // Set initial values
    this.syncPageSettingsInputs();

    // Event listeners
    if (titleInput) {
      titleInput.addEventListener('input', (e) => {
        const val = e.target.value;
        state.setPageSetting('pageTitle', val);
        document.title = `${val} (Admin Studio)`;
      });
    }

    themeSelect.addEventListener('change', (e) => {
      this.applyThemeSelection(e.target.value);
    });

    fontSelect.addEventListener('change', (e) => {
      const fontVal = e.target.value;
      state.setPageSetting('fontFamily', fontVal);
      this.canvas.showToast(`🔤 Base font updated`, 'info');
    });

    // Page Layout (Hide Header, Hide Footer, Transparent Header)
    const hideHeaderCb = document.getElementById('page-hide-header');
    const hideFooterCb = document.getElementById('page-hide-footer');
    const transparentHeaderCb = document.getElementById('page-transparent-header');

    if (hideHeaderCb) {
      hideHeaderCb.addEventListener('change', (e) => {
        state.setPageSetting('hideHeader', e.target.checked);
        this.canvas.render();
        this.canvas.showToast(e.target.checked ? '🚫 Header hidden on this page' : '👁️ Header visible on this page', 'info');
      });
    }

    if (hideFooterCb) {
      hideFooterCb.addEventListener('change', (e) => {
        state.setPageSetting('hideFooter', e.target.checked);
        this.canvas.render();
        this.canvas.showToast(e.target.checked ? '🚫 Footer hidden on this page' : '👁️ Footer visible on this page', 'info');
      });
    }

    if (transparentHeaderCb) {
      transparentHeaderCb.addEventListener('change', (e) => {
        state.setPageSetting('transparentHeader', e.target.checked);
        this.canvas.render();
        this.canvas.showToast(e.target.checked ? '🪟 Transparent header enabled' : 'Header background restored', 'info');
      });
    }

    // SEO & Social Meta fields
    const seoFields = [
      { id: 'page-meta-description', key: 'metaDescription', event: 'input' },
      { id: 'page-meta-keywords',    key: 'metaKeywords',    event: 'input' },
      { id: 'page-og-image',         key: 'ogImage',         event: 'input' },
      { id: 'page-canonical',        key: 'canonical',       event: 'input' }
    ];
    seoFields.forEach(({ id, key, event }) => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener(event, (e) => {
          state.setPageSetting(key, e.target.value);
        });
      }
    });
    const noIndexCb = document.getElementById('page-noindex');
    if (noIndexCb) {
      noIndexCb.addEventListener('change', (e) => {
        state.setPageSetting('noIndex', e.target.checked);
      });
    }

    // Pick OG / Social Share Image from Media Library
    const pickOgBtn = document.getElementById('btn-pick-og-image');
    if (pickOgBtn) {
      pickOgBtn.addEventListener('click', () => {
        if (typeof window.openMediaLibrary === 'function') {
          window.openMediaLibrary((selectedUrl) => {
            state.setPageSetting('ogImage', selectedUrl);
            const input = document.getElementById('page-og-image');
            if (input) input.value = selectedUrl;
            this.canvas?.showToast('Social share image updated from Media Library', 'success');
          });
        }
      });
    }

    // Custom Palette controls wiring
    const customEnableCheckbox = document.getElementById('theme-custom-enable');
    const customControlsBox = document.getElementById('theme-custom-controls');
    const resetBtn = document.getElementById('btn-reset-theme-custom');
    const applyGlobalBtn = document.getElementById('btn-apply-global-theme');

    const colorPairs = [
      { picker: 'theme-custom-primary', hex: 'theme-custom-primary-hex', key: 'primary' },
      { picker: 'theme-custom-secondary', hex: 'theme-custom-secondary-hex', key: 'secondary' },
      { picker: 'theme-custom-accent', hex: 'theme-custom-accent-hex', key: 'accent' },
      { picker: 'theme-custom-bgdeep', hex: 'theme-custom-bgdeep-hex', key: 'bgDeep' },
      { picker: 'theme-custom-bgcard', hex: 'theme-custom-bgcard-hex', key: 'bgCard' },
      { picker: 'theme-custom-textmain', hex: 'theme-custom-textmain-hex', key: 'textMain' },
    ];

    const updateCustomThemeFromInputs = () => {
      if (!customEnableCheckbox || !customEnableCheckbox.checked) return;
      const customObj = { enabled: true };
      colorPairs.forEach((pair) => {
        const pickerEl = document.getElementById(pair.picker);
        if (pickerEl) customObj[pair.key] = pickerEl.value;
      });
      state.setPageSetting('themeCustom', customObj);
    };

    if (customEnableCheckbox) {
      customEnableCheckbox.addEventListener('change', (e) => {
        const isChecked = e.target.checked;
        if (customControlsBox) customControlsBox.style.display = isChecked ? 'block' : 'none';
        if (!isChecked) {
          state.setPageSetting('themeCustom', { enabled: false });
          this.canvas.showToast('🎨 Reverted to preset colors', 'info');
        } else {
          // Fill inputs from current preset if no custom values exist
          const activePreset = THEME_PRESETS[state.pageSettings.themePreset || 'dark-neon'];
          if (activePreset && activePreset.vars) {
            const defaults = {
              primary: activePreset.vars['--primary'] || '#6366f1',
              secondary: activePreset.vars['--secondary'] || '#ec4899',
              accent: activePreset.vars['--accent'] || '#06b6d4',
              bgDeep: activePreset.vars['--bg-deep'] || '#090d16',
              bgCard: activePreset.vars['--bg-panel'] || '#131b2e',
              textMain: activePreset.vars['--text-main'] || '#f8fafc'
            };
            colorPairs.forEach((pair) => {
              const pEl = document.getElementById(pair.picker);
              const hEl = document.getElementById(pair.hex);
              if (pEl && hEl) {
                pEl.value = defaults[pair.key] || pEl.value;
                hEl.value = defaults[pair.key] || hEl.value;
              }
            });
          }
          updateCustomThemeFromInputs();
          this.canvas.showToast('🎨 Custom color palette enabled', 'success');
        }
      });
    }

    colorPairs.forEach((pair) => {
      const pEl = document.getElementById(pair.picker);
      const hEl = document.getElementById(pair.hex);
      if (pEl && hEl) {
        pEl.addEventListener('input', (e) => {
          hEl.value = e.target.value;
          updateCustomThemeFromInputs();
        });
        hEl.addEventListener('change', (e) => {
          let val = e.target.value.trim();
          if (!val.startsWith('#')) val = '#' + val;
          pEl.value = val;
          updateCustomThemeFromInputs();
        });
      }
    });

    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        if (customEnableCheckbox) customEnableCheckbox.checked = false;
        if (customControlsBox) customControlsBox.style.display = 'none';
        state.setPageSetting('themeCustom', { enabled: false });
        this.syncPageSettingsInputs();
        this.canvas.showToast('🎨 Palette reset to theme preset', 'info');
      });
    }

    if (applyGlobalBtn) {
      applyGlobalBtn.addEventListener('click', () => {
        const curPreset = state.pageSettings.themePreset || 'dark-neon';
        const curFont = state.pageSettings.fontFamily;
        const curCustom = state.pageSettings.themeCustom;

        state.pages.forEach((pg) => {
          if (!pg.pageSettings) pg.pageSettings = {};
          pg.pageSettings.themePreset = curPreset;
          pg.pageSettings.fontFamily = curFont;
          pg.pageSettings.themeCustom = curCustom;
        });
        state.saveAndPublish();
        this.canvas.showToast('🌐 Applied theme & palette globally to all pages', 'success');
      });
    }

    // Subscribe to state updates (e.g. undo/redo, template load, server sync)
    state.subscribe((_, action) => {
      if (['undo', 'redo', 'import', 'serverSync', 'loadTemplate', 'pageSettings'].includes(action)) {
        this.syncPageSettingsInputs();
      }
    });
  }

  applyThemeSelection(themeId) {
    if (!THEME_PRESETS[themeId]) return;
    state.setPageSetting('themePreset', themeId);
    this.syncPageSettingsInputs();
    this.canvas.showToast(`🎨 Theme preset applied: ${THEME_PRESETS[themeId].name}`, 'success');
  }

  syncPageSettingsInputs() {
    const titleInput = document.getElementById('page-title-input');
    const themeSelect = document.getElementById('theme-preset-select');
    const fontSelect = document.getElementById('font-family-select');
    const swatchList = document.getElementById('theme-swatch-list');

    const customEnableCheckbox = document.getElementById('theme-custom-enable');
    const customControlsBox = document.getElementById('theme-custom-controls');
    const themeCustom = state.pageSettings.themeCustom || {};

    const currentTheme = state.pageSettings.themePreset || 'dark-neon';
    const currentFont = state.pageSettings.fontFamily || "'Plus Jakarta Sans', sans-serif";
    const currentTitle = state.pageSettings.pageTitle || 'USPF MCLE - Modern Legal Excellence';

    if (titleInput && titleInput.value !== currentTitle) {
      titleInput.value = currentTitle;
    }
    if (themeSelect) {
      themeSelect.value = currentTheme;
    }
    if (fontSelect) {
      fontSelect.value = currentFont;
    }
    if (swatchList) {
      swatchList.querySelectorAll('.theme-swatch-card').forEach((card) => {
        const id = card.getAttribute('data-theme-id');
        card.classList.toggle('active', id === currentTheme);
      });
    }

    const hideHeaderCb = document.getElementById('page-hide-header');
    const hideFooterCb = document.getElementById('page-hide-footer');
    const transparentHeaderCb = document.getElementById('page-transparent-header');

    if (hideHeaderCb) hideHeaderCb.checked = !!state.pageSettings.hideHeader;
    if (hideFooterCb) hideFooterCb.checked = !!state.pageSettings.hideFooter;
    if (transparentHeaderCb) transparentHeaderCb.checked = !!state.pageSettings.transparentHeader;

    if (customEnableCheckbox) {
      customEnableCheckbox.checked = !!themeCustom.enabled;
    }
    if (customControlsBox) {
      customControlsBox.style.display = themeCustom.enabled ? 'block' : 'none';
    }

    if (themeCustom.enabled) {
      const activePreset = THEME_PRESETS[currentTheme] || THEME_PRESETS['dark-neon'];
      const defaultVars = activePreset.vars || {};
      const colorPairs = [
        { picker: 'theme-custom-primary', hex: 'theme-custom-primary-hex', val: themeCustom.primary || defaultVars['--primary'] || '#6366f1' },
        { picker: 'theme-custom-secondary', hex: 'theme-custom-secondary-hex', val: themeCustom.secondary || defaultVars['--secondary'] || '#ec4899' },
        { picker: 'theme-custom-accent', hex: 'theme-custom-accent-hex', val: themeCustom.accent || defaultVars['--accent'] || '#06b6d4' },
        { picker: 'theme-custom-bgdeep', hex: 'theme-custom-bgdeep-hex', val: themeCustom.bgDeep || defaultVars['--bg-deep'] || '#090d16' },
        { picker: 'theme-custom-bgcard', hex: 'theme-custom-bgcard-hex', val: themeCustom.bgCard || defaultVars['--bg-panel'] || '#131b2e' },
        { picker: 'theme-custom-textmain', hex: 'theme-custom-textmain-hex', val: themeCustom.textMain || defaultVars['--text-main'] || '#f8fafc' },
      ];
      colorPairs.forEach((pair) => {
        const pEl = document.getElementById(pair.picker);
        const hEl = document.getElementById(pair.hex);
        if (pEl) pEl.value = pair.val;
        if (hEl) hEl.value = pair.val;
      });
    }

    // Sync SEO fields
    const seoSyncMap = {
      'page-meta-description': 'metaDescription',
      'page-meta-keywords':    'metaKeywords',
      'page-og-image':         'ogImage',
      'page-canonical':        'canonical'
    };
    Object.entries(seoSyncMap).forEach(([id, key]) => {
      const el = document.getElementById(id);
      if (el && el.value !== (state.pageSettings[key] || '')) {
        el.value = state.pageSettings[key] || '';
      }
    });
    const noIndexEl = document.getElementById('page-noindex');
    if (noIndexEl) noIndexEl.checked = !!state.pageSettings.noIndex;
  }

  // --------------------------------------------------------------------------
  // SITE-WIDE SETTINGS WIRING
  // --------------------------------------------------------------------------
  initSiteSettings() {
    const textFields = [
      { id: 'site-name-input',      key: 'siteName' },
      { id: 'site-favicon-input',   key: 'faviconUrl' },
      { id: 'site-logo-input',      key: 'brandLogoUrl' },
      { id: 'site-ga-id',           key: 'gaId' },
      { id: 'site-pixel-id',        key: 'metaPixelId' },
      { id: 'site-custom-css',      key: 'customCss' },
      { id: 'site-header-scripts',  key: 'headerScripts' },
      { id: 'site-footer-scripts',  key: 'footerScripts' },
      { id: 'site-copyright-input', key: 'copyright' }
    ];

    textFields.forEach(({ id, key }) => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('input', (e) => {
          state.setSiteSetting(key, e.target.value);
          if (key === 'faviconUrl') this.updateFaviconPreview(e.target.value);
          if (key === 'customCss') this.applyLiveCustomCss(e.target.value);
        });
      }
    });

    // Pick Favicon from Media Library
    const pickFaviconBtn = document.getElementById('btn-pick-favicon');
    if (pickFaviconBtn) {
      pickFaviconBtn.addEventListener('click', () => {
        if (typeof window.openMediaLibrary === 'function') {
          window.openMediaLibrary((selectedUrl) => {
            state.setSiteSetting('faviconUrl', selectedUrl);
            const input = document.getElementById('site-favicon-input');
            if (input) input.value = selectedUrl;
            this.updateFaviconPreview(selectedUrl);
            this.canvas?.showToast('Favicon updated from Media Library', 'success');
          });
        }
      });
    }

    // Pick Brand Logo from Media Library
    const pickLogoBtn = document.getElementById('btn-pick-site-logo');
    if (pickLogoBtn) {
      pickLogoBtn.addEventListener('click', () => {
        if (typeof window.openMediaLibrary === 'function') {
          window.openMediaLibrary((selectedUrl) => {
            state.setSiteSetting('brandLogoUrl', selectedUrl);
            const input = document.getElementById('site-logo-input');
            if (input) input.value = selectedUrl;
            this.canvas?.showToast('Site logo updated from Media Library', 'success');
          });
        }
      });
    }

    // Admin Notification Alert Email
    const notifEmailInput = document.getElementById('site-notif-email');
    if (notifEmailInput) {
      notifEmailInput.addEventListener('input', (e) => {
        state.setSiteSetting('notificationEmail', e.target.value);
      });
    }

    // Chatbot Settings Wiring
    const cbEnableCb = document.getElementById('site-chatbot-enable');
    if (cbEnableCb) {
      cbEnableCb.addEventListener('change', (e) => {
        const curCb = state.siteSettings.chatbot || DEFAULT_CHATBOT_CONFIG;
        state.setSiteSetting('chatbot', { ...curCb, enabled: e.target.checked });
        this.canvas?.showToast(e.target.checked ? '🤖 24/7 Chatbot enabled' : 'Chatbot disabled', 'info');
      });
    }

    const cbFields = [
      { id: 'site-chatbot-title',    prop: 'title' },
      { id: 'site-chatbot-subtitle', prop: 'subtitle' },
      { id: 'site-chatbot-avatar',   prop: 'avatar' },
      { id: 'site-chatbot-bubble',   prop: 'bubbleText' }
    ];
    cbFields.forEach(({ id, prop }) => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('input', (e) => {
          const curCb = state.siteSettings.chatbot || DEFAULT_CHATBOT_CONFIG;
          state.setSiteSetting('chatbot', { ...curCb, [prop]: e.target.value });
          if (prop === 'avatar') this.updateChatbotAvatarPreview(e.target.value);
        });
      }
    });

    // Chatbot Avatar Pick from Media Library
    const pickChatbotAvatarBtn = document.getElementById('btn-pick-chatbot-avatar');
    if (pickChatbotAvatarBtn) {
      pickChatbotAvatarBtn.addEventListener('click', () => {
        if (typeof window.openMediaLibrary === 'function') {
          window.openMediaLibrary((selectedUrl) => {
            const curCb = state.siteSettings.chatbot || DEFAULT_CHATBOT_CONFIG;
            state.setSiteSetting('chatbot', { ...curCb, avatar: selectedUrl });
            const input = document.getElementById('site-chatbot-avatar');
            if (input) input.value = selectedUrl;
            this.updateChatbotAvatarPreview(selectedUrl);
            this.canvas?.showToast('Chatbot avatar updated from Media Library', 'success');
          });
        }
      });
    }

    // Global Background Image Wiring
    const globalBgEnable = document.getElementById('site-global-bg-enable');
    const globalBgControls = document.getElementById('site-global-bg-controls');
    const globalBgUrl = document.getElementById('site-global-bg-url');
    const pickGlobalBgBtn = document.getElementById('btn-pick-global-bg');
    const clearGlobalBgBtn = document.getElementById('btn-clear-global-bg');
    const globalBgSize = document.getElementById('site-global-bg-size');
    const globalBgAttachment = document.getElementById('site-global-bg-attachment');
    const globalBgPosition = document.getElementById('site-global-bg-position');
    const globalBgRepeat = document.getElementById('site-global-bg-repeat');
    const globalBgOpacity = document.getElementById('site-global-bg-opacity');

    const updateGlobalBgSetting = (key, value) => {
      const cur = state.siteSettings.globalBg || {};
      const updated = { ...cur, [key]: value };
      state.setSiteSetting('globalBg', updated);
      this.updateGlobalBgPreview(updated);
      this.canvas?.render();
    };

    if (globalBgEnable) {
      globalBgEnable.addEventListener('change', (e) => {
        updateGlobalBgSetting('enabled', e.target.checked);
        if (globalBgControls) globalBgControls.style.display = e.target.checked ? 'flex' : 'none';
        this.canvas?.showToast(e.target.checked ? '🖼️ Global Background Image enabled' : 'Global Background Image disabled', 'info');
      });
    }

    if (globalBgUrl) {
      globalBgUrl.addEventListener('input', (e) => {
        updateGlobalBgSetting('imageUrl', e.target.value.trim());
      });
    }

    if (pickGlobalBgBtn) {
      pickGlobalBgBtn.addEventListener('click', () => {
        if (typeof window.openMediaLibrary === 'function') {
          window.openMediaLibrary((selectedUrl) => {
            if (globalBgUrl) globalBgUrl.value = selectedUrl;
            updateGlobalBgSetting('imageUrl', selectedUrl);
            this.canvas?.showToast('Global background updated from Media Library', 'success');
          });
        }
      });
    }

    if (clearGlobalBgBtn) {
      clearGlobalBgBtn.addEventListener('click', () => {
        if (globalBgUrl) globalBgUrl.value = '';
        updateGlobalBgSetting('imageUrl', '');
      });
    }

    if (globalBgSize) {
      globalBgSize.addEventListener('change', (e) => updateGlobalBgSetting('size', e.target.value));
    }
    if (globalBgAttachment) {
      globalBgAttachment.addEventListener('change', (e) => updateGlobalBgSetting('attachment', e.target.value));
    }
    if (globalBgPosition) {
      globalBgPosition.addEventListener('change', (e) => updateGlobalBgSetting('position', e.target.value));
    }
    if (globalBgRepeat) {
      globalBgRepeat.addEventListener('change', (e) => updateGlobalBgSetting('repeat', e.target.value));
    }
    if (globalBgOpacity) {
      globalBgOpacity.addEventListener('input', (e) => {
        const valText = document.getElementById('site-global-bg-opacity-val');
        if (valText) valText.textContent = `${e.target.value}%`;
        updateGlobalBgSetting('overlayOpacity', Number(e.target.value));
      });
    }

    // Chatbot Flowchart Editor Modal
    document.getElementById('btn-edit-chatbot-flow')?.addEventListener('click', () => {
      this.showChatbotFlowModal();
    });

    // Live state subscriber for siteSettings sync & undo/redo
    state.subscribe((_, action) => {
      if (['siteSettings', 'serverSync', 'undo', 'redo', 'import'].includes(action)) {
        this.syncSiteSettingsInputs();
      }
    });

    this.syncSiteSettingsInputs();
  }

  updateGlobalBgPreview(bgConfig) {
    const previewWrap = document.getElementById('site-global-bg-preview-wrap');
    if (!previewWrap) return;
    const url = bgConfig?.imageUrl;
    if (url && url.trim()) {
      previewWrap.style.backgroundImage = `url('${url.trim()}')`;
      previewWrap.style.display = 'block';
    } else {
      previewWrap.style.display = 'none';
    }
  }

  updateChatbotAvatarPreview(val) {
    const preview = document.getElementById('site-chatbot-avatar-preview');
    if (!preview) return;
    const str = String(val || '💬').trim();
    if (
      str.startsWith('http://') ||
      str.startsWith('https://') ||
      str.startsWith('assets/') ||
      str.startsWith('/') ||
      /\.(png|jpg|jpeg|webp|gif|svg)(\?.*)?$/i.test(str)
    ) {
      preview.innerHTML = `<img src="${str}" alt="Bot" style="width:100%;height:100%;object-fit:cover;display:block;" />`;
    } else {
      preview.innerHTML = str || '💬';
    }
  }

  updateFaviconPreview(url) {
    const preview = document.getElementById('site-favicon-preview');
    if (!preview) return;
    if (url && url.trim()) {
      preview.src = url.trim();
      preview.style.display = 'block';
    } else {
      preview.style.display = 'none';
    }
  }

  applyLiveCustomCss(css) {
    let styleEl = document.getElementById('aether-site-custom-css');
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'aether-site-custom-css';
      document.head.appendChild(styleEl);
    }
    styleEl.textContent = css || '';
  }

  syncSiteSettingsInputs() {
    const s = state.siteSettings || {};
    const cb = s.chatbot || DEFAULT_CHATBOT_CONFIG;
    const map = {
      'site-name-input':      s.siteName || '',
      'site-favicon-input':   s.faviconUrl || '',
      'site-logo-input':      s.brandLogoUrl || '',
      'site-ga-id':           s.gaId || '',
      'site-pixel-id':        s.metaPixelId || '',
      'site-custom-css':      s.customCss || '',
      'site-header-scripts':  s.headerScripts || '',
      'site-footer-scripts':  s.footerScripts || '',
      'site-copyright-input': s.copyright || '',
      'site-notif-email':     s.notificationEmail || '',
      'site-chatbot-title':   cb.title || '',
      'site-chatbot-subtitle':cb.subtitle || '',
      'site-chatbot-avatar':  cb.avatar || '',
      'site-chatbot-bubble':  cb.bubbleText || ''
    };

    Object.entries(map).forEach(([id, val]) => {
      const el = document.getElementById(id);
      if (el && el.value !== val) el.value = val;
    });

    const cbEnableEl = document.getElementById('site-chatbot-enable');
    if (cbEnableEl) cbEnableEl.checked = cb.enabled !== false;

    // Sync Global Background Image inputs
    const gBg = s.globalBg || {};
    const gBgEnable = document.getElementById('site-global-bg-enable');
    const gBgControls = document.getElementById('site-global-bg-controls');
    if (gBgEnable) gBgEnable.checked = !!gBg.enabled;
    if (gBgControls) gBgControls.style.display = gBg.enabled ? 'flex' : 'none';

    const gBgUrl = document.getElementById('site-global-bg-url');
    if (gBgUrl && gBgUrl.value !== (gBg.imageUrl || '')) gBgUrl.value = gBg.imageUrl || '';

    const gBgSize = document.getElementById('site-global-bg-size');
    if (gBgSize) gBgSize.value = gBg.size || 'cover';

    const gBgAttachment = document.getElementById('site-global-bg-attachment');
    if (gBgAttachment) gBgAttachment.value = gBg.attachment || 'fixed';

    const gBgPosition = document.getElementById('site-global-bg-position');
    if (gBgPosition) gBgPosition.value = gBg.position || 'center center';

    const gBgRepeat = document.getElementById('site-global-bg-repeat');
    if (gBgRepeat) gBgRepeat.value = gBg.repeat || 'no-repeat';

    const gBgOpacity = document.getElementById('site-global-bg-opacity');
    const gBgOpacityVal = document.getElementById('site-global-bg-opacity-val');
    const op = gBg.overlayOpacity !== undefined ? gBg.overlayOpacity : 50;
    if (gBgOpacity) gBgOpacity.value = op;
    if (gBgOpacityVal) gBgOpacityVal.textContent = `${op}%`;

    this.updateGlobalBgPreview(gBg);
    this.updateChatbotAvatarPreview(cb.avatar);
    this.updateFaviconPreview(s.faviconUrl);
    this.applyLiveCustomCss(s.customCss);
  }

  // Bind Topbar Actions
  bindTopbarActions() {
    // Viewport switcher
    document.querySelectorAll('.device-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.device-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        state.setViewportMode(btn.getAttribute('data-mode'));
      });
    });

    // Undo / Redo
    const undoBtn = document.getElementById('btn-undo');
    const redoBtn = document.getElementById('btn-redo');

    const updateHistoryButtons = () => {
      undoBtn.disabled = !state.canUndo();
      redoBtn.disabled = !state.canRedo();
    };

    state.subscribe(updateHistoryButtons);
    updateHistoryButtons();

    undoBtn.addEventListener('click', () => state.undo());
    redoBtn.addEventListener('click', () => state.redo());

    // Clear Canvas
    document.getElementById('btn-clear').addEventListener('click', () => {
      if (confirm('Clear the entire canvas? You can undo with Ctrl+Z.')) {
        state.clearCanvas();
        this.canvas.showToast('Canvas cleared', 'info');
      }
    });

    // Publish to Live Public View (Handles both topbar & floating buttons)
    const handlePublish = async () => {
      const topbarBtn = document.getElementById('btn-publish');
      const floatBtn  = document.getElementById('btn-floating-publish');

      const setPublishState = (disabled, text) => {
        if (topbarBtn) { topbarBtn.disabled = disabled; topbarBtn.innerHTML = `<span>${disabled ? '⏳' : '🚀'}</span> ${text}`; }
        if (floatBtn)  { floatBtn.disabled  = disabled; floatBtn.innerHTML  = `<span>${disabled ? '⏳' : '🚀'}</span> ${text}`; }
      };

      setPublishState(true, 'Publishing...');
      await state.publishToLive();
      setPublishState(false, 'Publish Live');
      this.canvas.showToast('🚀 Changes published live! Synced to Hostinger server.', 'success');
    };

    document.getElementById('btn-publish')?.addEventListener('click', handlePublish);
    document.getElementById('btn-floating-publish')?.addEventListener('click', handlePublish);

    // Sync / Pull Latest from Server
    const btnSync = document.getElementById('btn-sync-server');
    if (btnSync) {
      btnSync.addEventListener('click', async () => {
        if (confirm('Sync latest published content from server? Any unsaved local edits in this browser session will be replaced with server data.')) {
          btnSync.disabled = true;
          btnSync.style.opacity = '0.5';
          const ok = await state.syncFromServer(true);
          btnSync.disabled = false;
          btnSync.style.opacity = '1';
          if (ok) {
            this.canvas.render();
            this.canvas.showToast('✅ Synced latest published content from server!', 'success');
          } else {
            this.canvas.showToast('⚠️ No published server data found to sync.', 'warning');
          }
        }
      });
    }

    // Notifications & Leads Inbox Modal
    document.getElementById('btn-notifications')?.addEventListener('click', () => {
      this.showNotificationsModal();
    });

    // Templates Library Modal
    document.getElementById('btn-templates').addEventListener('click', () => {
      this.showTemplatesModal();
    });

    // Revisions Version History & 1-Click Rollback Modal
    document.getElementById('btn-revisions')?.addEventListener('click', () => {
      this.showRevisionsModal();
    });

    // Pre-Publish SEO Health Audit Modal
    document.getElementById('btn-seo-audit')?.addEventListener('click', () => {
      this.showSeoAuditModal();
    });

    // Export / Import Modal
    document.getElementById('btn-export').addEventListener('click', () => {
      this.showExportModal();
    });

    // Argon2 Security Details & Password Manager
    document.getElementById('btn-security').addEventListener('click', () => {
      this.showSecurityModal();
    });

    // Logout
    document.getElementById('btn-logout').addEventListener('click', () => {
      if (confirm('Lock Admin Studio and log out?')) {
        auth.logout();
      }
    });
  }

  // Keyboard Shortcuts (Undo, Redo, Save/Publish)
  bindKeyboardShortcuts() {
    window.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        if (e.shiftKey) {
          state.redo();
        } else {
          state.undo();
        }
        e.preventDefault();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        state.redo();
        e.preventDefault();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        state.publishToLive();
        this.canvas.showToast('🚀 Published live via shortcut!', 'success');
      } else if (e.key === 'Escape') {
        state.setActiveElement(null);
      }
    });
  }

  // Template Library Modal
  showTemplatesModal() {
    let modal = document.getElementById('template-modal');
    if (modal) modal.remove();

    modal = document.createElement('div');
    modal.id = 'template-modal';
    modal.className = 'modal-overlay animate-fade-in';

    const templatesHtml = Object.values(TEMPLATES)
      .map(
        (tmpl) => `
      <div class="modal-box" style="flex: 1; min-width: 280px; background: rgba(23, 34, 59, 0.7); cursor: pointer;" data-template="${tmpl.id}">
        <img src="${tmpl.thumbnail}" alt="${tmpl.name}" style="width: 100%; height: 160px; object-fit: cover;" />
        <div style="padding: 16px;">
          <div style="font-weight: 800; font-size: 1.1rem; color: #fff; margin-bottom: 4px;">${tmpl.name}</div>
          <div style="font-size: 0.82rem; color: var(--primary-light); font-weight: 600; margin-bottom: 8px;">${tmpl.category}</div>
          <p style="font-size: 0.85rem; color: var(--text-muted); line-height: 1.5; margin-bottom: 14px;">${tmpl.description}</p>
          <button class="wb-btn wb-btn-primary" style="width: 100%; padding: 8px 16px; font-size: 0.88rem;">Load Template</button>
        </div>
      </div>
    `
      )
      .join('');

    modal.innerHTML = `
      <div class="modal-box modal-wide animate-scale-in">
        <div class="modal-header">
          <div class="modal-title"><span>📋</span> Pre-Built Template Library</div>
          <button class="tool-icon-btn" id="close-tmpl-modal">✕</button>
        </div>
        <div class="modal-body">
          <p style="font-size: 0.92rem; color: var(--text-muted);">Choose a ready-to-launch template. Loading a template will replace current canvas elements (you can undo anytime).</p>
          <div style="display: flex; gap: 20px; flex-wrap: wrap;">
            ${templatesHtml}
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    modal.querySelector('#close-tmpl-modal').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.remove();
    });

    modal.querySelectorAll('[data-template]').forEach((card) => {
      card.addEventListener('click', () => {
        const id = card.getAttribute('data-template');
        state.loadTemplate(id);
        modal.remove();
        this.canvas.showToast(`Loaded "${TEMPLATES[id].name}"`, 'success');
      });
    });
  }

  // Export / Import Modal
  showExportModal() {
    let modal = document.getElementById('export-modal');
    if (modal) modal.remove();

    modal = document.createElement('div');
    modal.id = 'export-modal';
    modal.className = 'modal-overlay animate-fade-in';

    const jsonContent = state.exportJSON();

    modal.innerHTML = `
      <div class="modal-box modal-wide animate-scale-in">
        <div class="modal-header">
          <div class="modal-title"><span>📤</span> Export & Import Project</div>
          <button class="tool-icon-btn" id="close-export-modal">✕</button>
        </div>
        <div class="modal-body">
          <div class="inspector-tabs" style="margin-bottom: 12px;">
            <button class="inspector-tab-btn active" id="tab-export-json">Export JSON</button>
            <button class="inspector-tab-btn" id="tab-export-html">Standalone HTML</button>
            <button class="inspector-tab-btn" id="tab-import-json">Import JSON</button>
          </div>

          <div id="export-json-view">
            <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 8px;">Copy this page configuration JSON, save to Media Library, or download as a backup file:</p>
            <textarea id="export-json-textarea" rows="12" style="width: 100%; font-family: var(--font-mono); font-size: 0.8rem;" readonly>${jsonContent}</textarea>
            <div style="display: flex; gap: 8px; margin-top: 10px; flex-wrap: wrap;">
              <button class="wb-btn wb-btn-primary" id="btn-copy-json" style="padding: 8px 16px; font-size: 0.85rem;">Copy JSON</button>
              <button class="wb-btn wb-btn-secondary" id="btn-save-media-template" style="padding: 8px 16px; font-size: 0.85rem;">📁 Save to Media Assets</button>
              <button class="wb-btn wb-btn-outline" id="btn-download-json" style="padding: 8px 16px; font-size: 0.85rem;">Download .json</button>
            </div>
          </div>

          <div id="export-html-view" style="display: none;">
            <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 8px;">Download a standalone production HTML file containing all rendered elements, widgets, and styles for immediate hosting:</p>
            <button class="wb-btn wb-btn-primary" id="btn-download-html" style="padding: 10px 24px; font-size: 0.95rem;">
              <span>💾</span> Download index.html Bundle
            </button>
          </div>

          <div id="import-json-view" style="display: none;">
            <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 8px;">Paste a previously saved AetherBuilder JSON configuration below, or load from saved Media Library assets:</p>
            <textarea id="import-json-textarea" rows="9" placeholder="Paste JSON here..." style="width: 100%; font-family: var(--font-mono); font-size: 0.8rem;"></textarea>
            <div style="display: flex; gap: 8px; margin-top: 10px;">
              <button class="wb-btn wb-btn-primary" id="btn-perform-import" style="padding: 8px 16px; font-size: 0.85rem;">Import and Replace Canvas</button>
              <button class="wb-btn wb-btn-secondary" id="btn-load-media-template" style="padding: 8px 16px; font-size: 0.85rem;">📁 Load Latest Media Template</button>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    modal.querySelector('#close-export-modal').addEventListener('click', () => modal.remove());

    // Switch export tabs
    const tabExportJson = modal.querySelector('#tab-export-json');
    const tabExportHtml = modal.querySelector('#tab-export-html');
    const tabImportJson = modal.querySelector('#tab-import-json');

    const viewJson = modal.querySelector('#export-json-view');
    const viewHtml = modal.querySelector('#export-html-view');
    const viewImport = modal.querySelector('#import-json-view');

    tabExportJson.addEventListener('click', () => {
      tabExportJson.classList.add('active');
      tabExportHtml.classList.remove('active');
      tabImportJson.classList.remove('active');
      viewJson.style.display = 'block';
      viewHtml.style.display = 'none';
      viewImport.style.display = 'none';
    });

    tabExportHtml.addEventListener('click', () => {
      tabExportHtml.classList.add('active');
      tabExportJson.classList.remove('active');
      tabImportJson.classList.remove('active');
      viewJson.style.display = 'none';
      viewHtml.style.display = 'block';
      viewImport.style.display = 'none';
    });

    tabImportJson.addEventListener('click', () => {
      tabImportJson.classList.add('active');
      tabExportJson.classList.remove('active');
      tabExportHtml.classList.remove('active');
      viewJson.style.display = 'none';
      viewHtml.style.display = 'none';
      viewImport.style.display = 'block';
    });

    // Copy JSON
    modal.querySelector('#btn-copy-json').addEventListener('click', () => {
      navigator.clipboard.writeText(jsonContent);
      this.canvas.showToast('JSON copied to clipboard!', 'success');
    });

    // Save Template directly to Media Library Assets
    modal.querySelector('#btn-save-media-template')?.addEventListener('click', async () => {
      const title = (state.pageSettings?.pageTitle || 'site').toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
      const fileName = `template_${title}_${Date.now()}.json`;
      const blob = new Blob([jsonContent], { type: 'application/json' });
      const file = new File([blob], fileName, { type: 'application/json' });
      const formData = new FormData();
      formData.append('file', file);
      try {
        const res = await fetch('api.php?action=upload', { method: 'POST', body: formData });
        const result = await res.json();
        if (result.success) {
          this.canvas.showToast(`📁 Template saved to Media Library Assets (${fileName})`, 'success');
        } else {
          this.canvas.showToast(`Failed to save template: ${result.error || 'Server error'}`, 'error');
        }
      } catch (err) {
        this.canvas.showToast('Error saving template to Media Library', 'error');
      }
    });

    // Load Latest Template from Media Library Assets
    modal.querySelector('#btn-load-media-template')?.addEventListener('click', async () => {
      try {
        const res = await fetch('api.php?action=list_assets');
        const data = await res.json();
        const jsonAssets = (data.assets || []).filter(a => a.ext === 'json');
        if (jsonAssets.length === 0) {
          this.canvas.showToast('No saved JSON template files found in Media Library', 'info');
          return;
        }
        const latest = jsonAssets[0];
        const res2 = await fetch(latest.url);
        const text = await res2.text();
        const success = state.importJSON(text);
        if (success) {
          state.saveAndPublish();
          this.canvas.showToast(`Loaded template: ${latest.name}`, 'success');
          modal.remove();
        } else {
          this.canvas.showToast('Invalid template file format', 'error');
        }
      } catch (err) {
        this.canvas.showToast('Error loading template from Media Library', 'error');
      }
    });

    // Download JSON
    modal.querySelector('#btn-download-json').addEventListener('click', () => {
      const blob = new Blob([jsonContent], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `aether-page-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    });

    // Download HTML
    modal.querySelector('#btn-download-html').addEventListener('click', () => {
      const liveData = state.getPublicSiteData();
      const settings = liveData.pageSettings || state.pageSettings || {};
      const siteSettings = liveData.siteSettings || state.siteSettings || {};
      const activePreset = THEME_PRESETS[settings.themePreset] || THEME_PRESETS['dark-neon'];
      const activeFont = settings.fontFamily || activePreset.font;
      const docTitle = settings.pageTitle || siteSettings.siteName || 'Published Site - AetherBuilder';

      const varCss = Object.entries(activePreset.vars || {})
        .map(([k, v]) => `    ${k}: ${v};`)
        .join('\n');

      const renderedElements = (liveData.sections || [])
        .map((s) => {
          const wDef = WIDGET_REGISTRY[s.widgetType];
          if (!wDef) return '';
          const html = wDef.render(s.props, { isPublicMode: true });
          // Wrap addon widgets with data attributes so customJs can target them
          if (wDef.isAddon && wDef.addonId) {
            let propsAttr = '';
            try { propsAttr = ` data-addon-props='${JSON.stringify(s.props || {}).replace(/'/g, "&#39;")}'`; } catch {}
            return `<div data-addon-id="${wDef.addonId}"${propsAttr}>${html}</div>`;
          }
          return html;
        })
        .join('\n');

      const standaloneHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${docTitle}</title>
  ${settings.metaDescription ? `<meta name="description" content="${settings.metaDescription}">` : ''}
  ${settings.metaKeywords ? `<meta name="keywords" content="${settings.metaKeywords}">` : ''}
  ${settings.noIndex ? `<meta name="robots" content="noindex, nofollow">` : ''}
  <meta property="og:title" content="${docTitle}">
  ${settings.metaDescription ? `<meta property="og:description" content="${settings.metaDescription}">` : ''}
  ${settings.ogImage ? `<meta property="og:image" content="${settings.ogImage}">` : ''}
  <meta property="og:type" content="website">
  ${settings.canonical ? `<link rel="canonical" href="${settings.canonical}">` : ''}
  ${siteSettings.faviconUrl ? `<link rel="icon" href="${siteSettings.faviconUrl}">\n  <link rel="shortcut icon" href="${siteSettings.faviconUrl}">` : ''}
  <link rel="stylesheet" href="css/design-system.css">
  <link rel="stylesheet" href="css/widgets.css">
  <link rel="stylesheet" href="css/animations.css">
  <style>
    :root {
${varCss}
      --font-sans: ${activeFont};
    }
    body {
      background-color: ${activePreset.vars['--bg-deep']};
    }
  </style>
  ${siteSettings.customCss ? `<style id="aether-site-custom-css">\n${siteSettings.customCss}\n  </style>` : ''}
  ${addonManager.getAllActiveCss() ? `<style id="wb-addons-css">\n${addonManager.getAllActiveCss()}\n  </style>` : ''}
  ${siteSettings.gaId ? `<script async src="https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(siteSettings.gaId)}"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', '${siteSettings.gaId}');
  </script>` : ''}
  ${siteSettings.headerScripts || ''}
</head>
<body data-preset="${activePreset.id}">
  <div id="site-root">
    ${renderedElements}
  </div>
  ${siteSettings.footerScripts || ''}
  <script>
    document.addEventListener('DOMContentLoaded', function() {
      // Mobile Navigation Drawer Toggle
      document.querySelectorAll('.wb-navbar').forEach(function(navbar) {
        var toggleBtn = navbar.querySelector('.wb-nav-toggle');
        var mobileMenu = navbar.querySelector('.wb-nav-mobile-menu');
        if (!toggleBtn || !mobileMenu) return;
        var toggleIcon = toggleBtn.querySelector('.wb-nav-toggle-icon') || toggleBtn;
        function setOpen(open) {
          if (open) {
            navbar.classList.add('is-open');
            toggleBtn.setAttribute('aria-expanded', 'true');
            mobileMenu.setAttribute('aria-hidden', 'false');
            toggleIcon.textContent = '✕';
          } else {
            navbar.classList.remove('is-open');
            toggleBtn.setAttribute('aria-expanded', 'false');
            mobileMenu.setAttribute('aria-hidden', 'true');
            toggleIcon.textContent = '☰';
          }
        }
        toggleBtn.addEventListener('click', function(e) {
          e.stopPropagation();
          e.preventDefault();
          setOpen(!navbar.classList.contains('is-open'));
        });
        mobileMenu.querySelectorAll('a').forEach(function(link) {
          link.addEventListener('click', function() { setOpen(false); });
        });
        document.addEventListener('click', function(e) {
          if (!navbar.contains(e.target) && navbar.classList.contains('is-open')) {
            setOpen(false);
          }
        });
      });

      // Interactive Carousel Sliders
      document.querySelectorAll('.wb-slider-container').forEach(function(slider) {
        var track = slider.querySelector('.wb-slider-track');
        var slides = slider.querySelectorAll('.wb-slide');
        var prevBtn = slider.querySelector('.wb-slider-btn.prev');
        var nextBtn = slider.querySelector('.wb-slider-btn.next');
        var dots = slider.querySelectorAll('.wb-slider-dot');
        if (!track || slides.length === 0) return;
        var cur = 0, count = slides.length;
        var auto = slider.getAttribute('data-autoplay') === 'true';
        var interval = parseInt(slider.getAttribute('data-interval'), 10) || 4500;
        var timer = null;
        function update() {
          track.style.transform = 'translateX(-' + (cur * 100) + '%)';
          dots.forEach(function(d, i) { d.classList.toggle('active', i === cur); });
        }
        function next() { cur = (cur + 1) % count; update(); }
        function prev() { cur = (cur - 1 + count) % count; update(); }
        if (nextBtn) nextBtn.onclick = function() { next(); resetAuto(); };
        if (prevBtn) prevBtn.onclick = function() { prev(); resetAuto(); };
        dots.forEach(function(d, i) { d.onclick = function() { cur = i; update(); resetAuto(); }; });
        function startAuto() { if (auto && count > 1) { timer = setInterval(next, interval); } }
        function resetAuto() { if (timer) clearInterval(timer); startAuto(); }
        slider.onmouseenter = function() { if (timer) clearInterval(timer); };
        slider.onmouseleave = resetAuto;
        update();
        startAuto();
      });

      // Seminar Schedule Displayer Interactive Slider
      document.querySelectorAll('.wb-schedule-widget').forEach(function(widget) {
        var track = widget.querySelector('.wb-schedule-slider-track');
        var slides = widget.querySelectorAll('.wb-schedule-slide');
        var prevBtn = widget.querySelector('.wb-schedule-nav-btn.prev');
        var nextBtn = widget.querySelector('.wb-schedule-nav-btn.next');
        var dots = widget.querySelectorAll('.wb-schedule-dot');
        var pageInfo = widget.querySelector('.wb-schedule-page-info');
        var dayTabs = widget.querySelectorAll('.wb-schedule-day-tab');
        if (!track || slides.length === 0) return;
        var cur = 0, count = slides.length;
        var auto = widget.getAttribute('data-autoplay') === 'true';
        var interval = parseInt(widget.getAttribute('data-interval'), 10) || 5000;
        var timer = null;
        function update() {
          track.style.transform = 'translateX(-' + (cur * 100) + '%)';
          dots.forEach(function(d, i) { d.classList.toggle('active', i === cur); });
          if (prevBtn) prevBtn.disabled = cur === 0;
          if (nextBtn) nextBtn.disabled = cur >= count - 1;
          if (pageInfo) pageInfo.textContent = 'Page ' + (cur + 1) + ' of ' + count;
          var curSlide = slides[cur];
          var curDay = curSlide ? curSlide.getAttribute('data-day') : '';
          if (curDay && dayTabs.length > 0) {
            dayTabs.forEach(function(tab) {
              tab.classList.toggle('active', tab.getAttribute('data-day') === curDay);
            });
          }
        }
        function goTo(idx) { cur = Math.max(0, Math.min(idx, count - 1)); update(); }
        if (prevBtn) prevBtn.onclick = function() { goTo(cur - 1); resetAuto(); };
        if (nextBtn) nextBtn.onclick = function() { goTo(cur + 1); resetAuto(); };
        dots.forEach(function(dot, i) { dot.onclick = function() { goTo(i); resetAuto(); }; });
        dayTabs.forEach(function(tab) {
          tab.onclick = function() {
            var targetDay = tab.getAttribute('data-day');
            if (!targetDay || targetDay === 'all') {
              goTo(0);
              dayTabs.forEach(function(t) { t.classList.remove('active'); });
              tab.classList.add('active');
            } else {
              for (var i = 0; i < slides.length; i++) {
                if (slides[i].getAttribute('data-day') === targetDay) {
                  goTo(i);
                  break;
                }
              }
            }
            resetAuto();
          };
        });
        function startAuto() { if (auto && count > 1) { timer = setInterval(function() { cur = (cur + 1) % count; update(); }, interval); } }
        function resetAuto() { if (timer) clearInterval(timer); startAuto(); }
        widget.onmouseenter = function() { if (timer) clearInterval(timer); };
        widget.onmouseleave = resetAuto;
        update();
        startAuto();
      });

      // FAQ Accordion Toggle
      document.querySelectorAll('.wb-faq-item').forEach(function(item) {
        var q = item.querySelector('.wb-faq-question');
        if (!q) return;
        q.addEventListener('click', function() {
          var isOpen = item.classList.contains('is-open');
          item.classList.toggle('is-open', !isOpen);
          q.setAttribute('aria-expanded', !isOpen ? 'true' : 'false');
        });
      });

      // ── Dynamic Registration Form Handler (with Google Sheets sync) ──
      document.querySelectorAll('.wb-reg-form').forEach(function(form) {
        // Real-time file size check on change
        form.querySelectorAll('.wb-reg-file-input').forEach(function(fileInput) {
          fileInput.addEventListener('change', function() {
            var file = fileInput.files && fileInput.files[0];
            var box = fileInput.closest('.wb-reg-file-box');
            var errEl = box ? box.querySelector('.wb-reg-file-error') : null;
            var maxMB = parseFloat(fileInput.getAttribute('data-max-size-mb')) || 5;

            if (file) {
              var sizeMB = file.size / (1024 * 1024);
              if (sizeMB > maxMB) {
                fileInput.value = ''; // Reset invalid file
                if (errEl) {
                  errEl.textContent = '⚠️ File "' + file.name + '" (' + sizeMB.toFixed(1) + ' MB) exceeds the ' + maxMB + ' MB limit. Please select a smaller file.';
                  errEl.style.display = 'block';
                }
              } else {
                if (errEl) {
                  errEl.textContent = '';
                  errEl.style.display = 'none';
                }
              }
            }
          });
        });

        // Interactive image option cards
        form.querySelectorAll('.wb-reg-img-option').forEach(function(optLabel) {
          var radio = optLabel.querySelector('.wb-reg-img-radio');
          if (!radio) return;
          var updateSelection = function() {
            var allInGroup = form.querySelectorAll('input[name="' + radio.name + '"]');
            allInGroup.forEach(function(r) {
              var p = r.closest('.wb-reg-img-option');
              if (p) {
                if (r.checked) p.classList.add('is-selected');
                else p.classList.remove('is-selected');
              }
            });
          };
          if (radio.checked) optLabel.classList.add('is-selected');
          radio.addEventListener('change', updateSelection);
          optLabel.addEventListener('click', function(e) {
            if (e.target !== radio) {
              radio.checked = true;
              updateSelection();
            }
          });
        });

        form.addEventListener('submit', async function(e) {
          e.preventDefault();
          var widget = form.closest('.wb-registration-widget');
          var statusEl = form.querySelector('.wb-reg-status');
          var submitBtn = form.querySelector('.wb-reg-submit-btn');
          var successMsg = form.getAttribute('data-success-msg') || 'Registration submitted!';
          var gsheetUrl = widget ? widget.getAttribute('data-gsheet-url') : '';
          var apiBase = (typeof window._aetherApiBase !== 'undefined') ? window._aetherApiBase : 'api.php';

          // Pre-flight check: validate all file inputs
          var fileInputs = form.querySelectorAll('.wb-reg-file-input');
          var fileValidationError = null;
          for (var fi = 0; fi < fileInputs.length; fi++) {
            var finp = fileInputs[fi];
            var f = finp.files && finp.files[0];
            if (f) {
              var maxMB = parseFloat(finp.getAttribute('data-max-size-mb')) || 5;
              var szMB = f.size / (1024 * 1024);
              if (szMB > maxMB) {
                fileValidationError = 'File "' + f.name + '" (' + szMB.toFixed(1) + ' MB) exceeds the ' + maxMB + ' MB size limit.';
                break;
              }
            }
          }
          if (fileValidationError) {
            if (statusEl) {
              statusEl.textContent = '⚠️ ' + fileValidationError;
              statusEl.className = 'wb-reg-status is-error';
              statusEl.style.display = 'block';
            }
            return;
          }

          if (submitBtn) { submitBtn.disabled = true; submitBtn.style.opacity = '0.6'; }
          if (statusEl) { statusEl.style.display = 'none'; statusEl.className = 'wb-reg-status'; }

          // Build payload & upload files to server media storage so real URLs are generated
          var payload = { type: 'registration' };
          var elements = form.elements;
          var fileUploadPromises = [];

          for (var i = 0; i < elements.length; i++) {
            var el = elements[i];
            if (!el.name || el.name === '_hp') continue;

            if (el.type === 'file') {
              if (el.files && el.files[0]) {
                (function(name, file) {
                  fileUploadPromises.push(new Promise(async function(resolve) {
                    try {
                      var formData = new FormData();
                      formData.append('file', file);
                      var upRes = await fetch(apiBase + '?action=upload', {
                        method: 'POST',
                        body: formData
                      });
                      var upData = await upRes.json();
                      if (upData && upData.success && upData.url) {
                        var fileLink = window.location.origin + '/' + upData.url.replace(/^\//, '');
                        payload[name] = fileLink;
                        payload[name + '_filename'] = file.name;
                        payload[name + '_url'] = fileLink;
                      } else {
                        payload[name] = file.name + ' (Uploaded)';
                      }
                    } catch(err) {
                      console.warn('File upload to media error:', err);
                      payload[name] = file.name;
                    }
                    resolve();
                  }));
                })(el.name, el.files[0]);
              } else {
                payload[el.name] = '';
              }
            } else if (el.type === 'checkbox') {
              payload[el.name] = el.checked ? 'Yes' : 'No';
            } else if (el.type === 'radio') {
              if (payload[el.name] === undefined) {
                payload[el.name] = '';
              }
              if (el.checked) {
                payload[el.name] = el.value;
              }
            } else if (el.type !== 'submit') {
              payload[el.name] = el.value;
            }
          }

          // Wait for all file uploads to finish
          if (fileUploadPromises.length > 0) {
            if (statusEl) {
              statusEl.textContent = '⏳ Uploading files & submitting...';
              statusEl.className = 'wb-reg-status';
              statusEl.style.display = 'block';
            }
            await Promise.all(fileUploadPromises);
          }

          // 1. Save to local submissions store
          try {
            var localRes = await fetch(apiBase + '?action=submit_form', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload)
            });
            var localData = await localRes.json();
            if (!localData.success) throw new Error(localData.message || 'Local save failed');
          } catch(err) {
            if (statusEl) {
              statusEl.textContent = '⚠️ Submission failed. Please try again. (' + err.message + ')';
              statusEl.className = 'wb-reg-status is-error';
              statusEl.style.display = 'block';
            }
            if (submitBtn) { submitBtn.disabled = false; submitBtn.style.opacity = '1'; }
            return;
          }

          // 2. Mirror to Google Sheets with real file URL links (clean non-redundant columns)!
          if (gsheetUrl && gsheetUrl.indexOf('script.google.com') !== -1) {
            try {
              var excludeSummary = widget ? widget.getAttribute('data-gsheet-exclude-summary') !== 'false' : true;
              var excludeMeta = widget ? widget.getAttribute('data-gsheet-exclude-meta') !== 'false' : true;
              var excludeHidden = widget ? widget.getAttribute('data-gsheet-exclude-hidden') !== 'false' : true;

              // Find hidden inputs if excludeHidden is active
              var hiddenNames = {};
              if (excludeHidden) {
                var hiddenInputs = form.querySelectorAll('input[type="hidden"]');
                for (var hi = 0; hi < hiddenInputs.length; hi++) {
                  if (hiddenInputs[hi].name) hiddenNames[hiddenInputs[hi].name] = true;
                }
              }

              var labelMap = {};
              var regFields = form.querySelectorAll('.wb-reg-field');
              for (var rfi = 0; rfi < regFields.length; rfi++) {
                var fld = regFields[rfi];
                var inp = fld.querySelector('input,select,textarea');
                var lbl = fld.querySelector('.wb-reg-label');
                if (inp && inp.name && lbl) {
                  var cleanLbl = lbl.textContent.replace(/\s*\*.*$/, '').trim().replace(/[^a-zA-Z0-9_]/g, '_');
                  if (cleanLbl) labelMap[inp.name] = cleanLbl;
                }
              }

              var sheetPayload = {};
              Object.keys(payload).forEach(function(k) {
                // Always exclude internal system helpers
                if (k === '_hp' || k === 'website_hp' || k === 'extra' || k.endsWith('_b64')) return;

                // Exclude redundant file auxiliary keys (*_filename, *_url) since the field itself contains the link!
                if (k.endsWith('_filename') || k.endsWith('_url')) return;

                // Exclude system metadata if enabled
                if (excludeMeta && (k === 'type' || k === 'page')) return;

                // Exclude summary / message column if enabled
                if (excludeSummary && k === 'message') return;

                // Exclude hidden fields if enabled
                if (excludeHidden && hiddenNames[k]) return;

                // Exclude duplicate generic fields if specific user fields exist
                if (k === 'name' && (payload.FullName || payload.fullName || payload.full_name || payload.Full_Name)) return;
                if (k === 'email' && (payload.Email || payload.email_address || payload.Email_Address)) return;
                if (k === 'phone' && (payload.Phone || payload.mobile || payload.Mobile || payload.Mobile_No || payload.Mobile_No_)) return;

                var finalKey = (k.indexOf('field_') === 0 && labelMap[k]) ? labelMap[k] : k;
                sheetPayload[finalKey] = payload[k]; // Real media URL for file fields!
              });
              fetch(gsheetUrl, {
                method: 'POST',
                mode: 'no-cors',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify(sheetPayload)
              }).catch(function() {});
            } catch(ignored) {}
          }

          // 3. Show success & reset form
          form.querySelectorAll('input:not([type=hidden]),select,textarea').forEach(function(inp) {
            inp.value = '';
            if (inp.type === 'checkbox') inp.checked = false;
          });
          if (statusEl) {
            statusEl.textContent = successMsg;
            statusEl.className = 'wb-reg-status is-success';
            statusEl.style.display = 'block';
          }
          if (submitBtn) { submitBtn.disabled = false; submitBtn.style.opacity = '1'; }

          // Show card-style e-receipt modal with important details and image download
          if (typeof window.showRegistrationReceiptModal === 'function') {
            var formTitleEl = widget ? widget.querySelector('.wb-reg-title') : null;
            var titleText = formTitleEl ? formTitleEl.textContent : 'Official Registration E-Receipt';
            window.showRegistrationReceiptModal(payload, { form: form, title: titleText });
          }
        });
      });
    });
  </script>
  <script type="module" src="./js/receipt.js"></script>
  ${(siteSettings.chatbot && siteSettings.chatbot.enabled !== false) ? `
  <script type="module">
    import { initPublicChatbot } from './js/chatbot.js';
    initPublicChatbot(${JSON.stringify(siteSettings.chatbot)});
  </script>` : ''}
  ${addonManager.getAllActiveJs() ? `<script id="wb-addons-js">
/* ══ AetherBuilder • Custom Add-On JavaScript ══ */
(function() {
  function runAddonMounts() {
${addonManager.getAllActiveJs()}
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', runAddonMounts);
  } else {
    runAddonMounts();
  }
})();
</script>` : ''}
</body>
</html>`;

      const blob = new Blob([standaloneHtml], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'published-index.html';
      a.click();
      URL.revokeObjectURL(url);
    });

    // Perform Import
    modal.querySelector('#btn-perform-import').addEventListener('click', () => {
      const text = modal.querySelector('#import-json-textarea').value.trim();
      if (!text) return;
      const success = state.importJSON(text);
      if (success) {
        modal.remove();
        this.canvas.showToast('Project imported successfully!', 'success');
      } else {
        alert('Invalid JSON format. Please verify the configuration.');
      }
    });
  }

  // Argon2 Security Modal & Password Manager
  showSecurityModal() {
    let modal = document.getElementById('security-modal');
    if (modal) modal.remove();

    const storedHash = auth.getStoredHash();

    modal = document.createElement('div');
    modal.id = 'security-modal';
    modal.className = 'modal-overlay animate-fade-in';
    modal.innerHTML = `
      <div class="modal-box animate-scale-in">
        <div class="modal-header">
          <div class="modal-title">
            <span>🔐</span> Argon2id Security Center
          </div>
          <button class="tool-icon-btn" id="close-sec-modal">✕</button>
        </div>
        <div class="modal-body">
          <div class="argon2-verify-box">
            <div style="font-weight: 700; color: #fff;">Cryptographic Spec:</div>
            <div style="font-size: 0.82rem; line-height: 1.5;">
              • Algorithm: <strong>Argon2id (PHC format)</strong><br>
              • WebAssembly Acceleration: <strong>hash-wasm v4</strong><br>
              • Memory Cost: <strong>4096 KB (4 MB)</strong><br>
              • Iterations: <strong>3 passes</strong><br>
              • Salt: <strong>16-byte cryptographically secure random</strong>
            </div>
            <div style="font-weight: 700; margin-top: 6px; color: #fff;">Stored Argon2 Hash:</div>
            <div class="argon2-hash-preview">${storedHash}</div>
          </div>

          <form id="change-pass-form" style="display: flex; flex-direction: column; gap: 12px; margin-top: 8px;">
            <div style="font-weight: 700; font-size: 0.95rem;">Update Master Password</div>
            <div class="prop-group">
              <label class="prop-label">Current Password</label>
              <input type="password" id="cur-pass-input" placeholder="Current password..." required />
            </div>
            <div class="prop-group">
              <label class="prop-label">New Master Password</label>
              <input type="password" id="new-pass-input" placeholder="New password (min 4 chars)..." required />
            </div>
            <div id="change-pass-msg" style="font-size: 0.85rem; font-weight: 600; min-height: 18px;"></div>
            <button type="submit" class="wb-btn wb-btn-primary" style="width: 100%;">
              <span>Re-hash & Save with Argon2</span>
            </button>
          </form>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    modal.querySelector('#close-sec-modal').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.remove();
    });

    const form = modal.querySelector('#change-pass-form');
    const msg = modal.querySelector('#change-pass-msg');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      msg.textContent = 'Computing new Argon2id hash...';
      msg.style.color = 'var(--warning)';

      const curPass = modal.querySelector('#cur-pass-input').value;
      const newPass = modal.querySelector('#new-pass-input').value;

      const res = await auth.updatePassword(curPass, newPass);
      if (res.success) {
        msg.textContent = '✓ Password successfully updated and hashed!';
        msg.style.color = 'var(--success)';
        setTimeout(() => modal.remove(), 1500);
      } else {
        msg.textContent = res.error || 'Failed to update password.';
        msg.style.color = 'var(--danger)';
      }
    });
  }

  // --------------------------------------------------------------------------
  // NOTIFICATIONS & LEADS HUB
  // --------------------------------------------------------------------------
  initNotificationsHub() {
    this.unreadNotifsCount = 0;
    this.checkNotifications();
    if (this._notifInterval) clearInterval(this._notifInterval);
    this._notifInterval = setInterval(() => this.checkNotifications(), 25000);
  }

  async checkNotifications() {
    try {
      const res = await fetch(`api.php?action=get_submissions&_t=${Date.now()}`);
      if (!res.ok) return;
      const data = await res.json();
      if (!data.success) return;

      const unread = data.unreadCount || 0;
      const badge = document.getElementById('notif-badge');
      if (badge) {
        if (unread > 0) {
          badge.textContent = unread > 99 ? '99+' : unread;
          badge.style.display = 'block';
          if (unread > this.unreadNotifsCount && this.unreadNotifsCount !== 0) {
            this.playNotificationChime();
            this.canvas?.showToast(`🔔 New lead received! (${unread} unread)`, 'info');
          }
        } else {
          badge.style.display = 'none';
        }
      }
      this.unreadNotifsCount = unread;
    } catch {}
  }

  playNotificationChime() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, now);
      osc.frequency.setValueAtTime(659.25, now + 0.1);
      osc.frequency.setValueAtTime(783.99, now + 0.2);
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.5);
    } catch {}
  }

  async showNotificationsModal() {
    const modal = document.createElement('div');
    modal.className = 'media-modal-overlay';
    modal.id = 'notifications-modal';
    modal.innerHTML = `
      <div class="media-modal-panel" style="max-width: 820px; height: 600px; display: flex; flex-direction: column;">
        <div class="media-modal-header" style="padding: 14px 18px;">
          <div style="display: flex; align-items: center; gap: 10px;">
            <span style="font-size: 1.5rem;">📬</span>
            <div>
              <div style="font-weight: 700; font-size: 1.05rem; color: #f8fafc;">Leads &amp; Notifications Hub</div>
              <div style="font-size: 0.74rem; color: var(--text-dim);" id="notif-modal-sub">Loading submissions...</div>
            </div>
          </div>
          <div style="display: flex; gap: 8px; align-items: center;">
            <button id="notif-btn-export-csv" class="topbar-btn topbar-btn-sm" style="background: rgba(16,185,129,0.18); border-color: #10b981; color: #6ee7b7;" title="Export all submissions as CSV spreadsheet">
              📥 Export CSV
            </button>
            <button id="notif-btn-mark-all" class="topbar-btn topbar-btn-sm" title="Mark all submissions as read">
              ✓ Mark All Read
            </button>
            <button class="media-modal-close" id="close-notif-modal">✕</button>
          </div>
        </div>

        <!-- Filter & Search Toolbar -->
        <div style="padding: 10px 18px; background: rgba(15,23,42,0.6); border-bottom: 1px solid var(--border-subtle); display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap;">
          <div style="display: flex; gap: 6px;" id="notif-filter-group">
            <button class="btn btn-sm active-filter" data-filter="all" style="font-size:0.75rem; padding: 4px 10px; border-radius: 6px; border: 1px solid rgba(99,102,241,0.4); background: rgba(99,102,241,0.25); color: #fff; cursor: pointer;">All</button>
            <button class="btn btn-sm" data-filter="chatbot" style="font-size:0.75rem; padding: 4px 10px; border-radius: 6px; border: 1px solid var(--border-subtle); background: var(--bg-surface); color: var(--text-muted); cursor: pointer;">🤖 Chatbot</button>
            <button class="btn btn-sm" data-filter="contact" style="font-size:0.75rem; padding: 4px 10px; border-radius: 6px; border: 1px solid var(--border-subtle); background: var(--bg-surface); color: var(--text-muted); cursor: pointer;">📝 Contact</button>
            <button class="btn btn-sm" data-filter="registration" style="font-size:0.75rem; padding: 4px 10px; border-radius: 6px; border: 1px solid var(--border-subtle); background: var(--bg-surface); color: var(--text-muted); cursor: pointer;">🎫 Registrations</button>
          </div>
          <input type="text" id="notif-search-input" placeholder="🔍 Search name, email, phone..." style="width: 220px; font-size: 0.76rem; padding: 5px 10px; border-radius: 6px; border: 1px solid var(--border-subtle); background: var(--bg-deep); color: var(--text-main);" />
        </div>

        <!-- Submissions Stream Container -->
        <div style="flex: 1; overflow-y: auto; padding: 14px 18px; display: flex; flex-direction: column; gap: 10px;" id="notif-list-container">
          <div style="text-align: center; color: var(--text-dim); padding: 40px;">Loading leads...</div>
        </div>

        <!-- Footer -->
        <div class="media-modal-footer" style="padding: 10px 18px; justify-content: space-between;">
          <button id="notif-btn-clear-all" class="topbar-btn topbar-btn-sm" style="color: var(--danger); border-color: rgba(239,68,68,0.3); background: rgba(239,68,68,0.1);">
            🗑️ Clear All History
          </button>
          <button class="topbar-btn topbar-btn-publish" id="notif-btn-done">Done</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const closeModal = () => modal.remove();
    modal.querySelector('#close-notif-modal').addEventListener('click', closeModal);
    modal.querySelector('#notif-btn-done').addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

    // Export CSV
    modal.querySelector('#notif-btn-export-csv').addEventListener('click', () => {
      window.open('api.php?action=export_submissions_csv', '_blank');
      this.canvas?.showToast('📥 Downloading submissions CSV...', 'info');
    });

    let allSubs = [];
    let currentFilter = 'all';
    let searchQuery = '';

    const renderList = () => {
      const container = modal.querySelector('#notif-list-container');
      const filtered = allSubs.filter(s => {
        const matchesType = currentFilter === 'all' || s.type === currentFilter;
        const q = searchQuery.toLowerCase();
        const matchesSearch = !q || (s.name && s.name.toLowerCase().includes(q))
                                || (s.email && s.email.toLowerCase().includes(q))
                                || (s.phone && s.phone.toLowerCase().includes(q))
                                || (s.message && s.message.toLowerCase().includes(q));
        return matchesType && matchesSearch;
      });

      if (filtered.length === 0) {
        container.innerHTML = `
          <div style="text-align: center; color: var(--text-dim); padding: 50px 20px;">
            <div style="font-size: 2.2rem; margin-bottom: 8px;">📭</div>
            <div style="font-weight: 600; font-size: 0.95rem; color: var(--text-muted);">No submissions found</div>
            <div style="font-size: 0.78rem; margin-top: 4px;">Leads from the chatbot and contact forms will appear here in real time.</div>
          </div>
        `;
        return;
      }

      container.innerHTML = filtered.map(s => {
        const isUnread = !s.is_read;
        const dateStr = s.submitted_at ? new Date(s.submitted_at).toLocaleString() : 'Recent';
        const typeBadge = s.type === 'chatbot' ? '🤖 Chatbot Lead' : s.type === 'registration' ? '🎫 Registration' : '📝 Contact Form';
        const typeBg = s.type === 'chatbot' ? 'rgba(99,102,241,0.2)' : s.type === 'registration' ? 'rgba(16,185,129,0.2)' : 'rgba(56,189,248,0.2)';
        const typeColor = s.type === 'chatbot' ? '#a5b4fc' : s.type === 'registration' ? '#6ee7b7' : '#7dd3fc';

        return `
          <div class="notif-card" data-sub-id="${s.id}" style="background: rgba(30,41,59,0.7); border: 1px solid ${isUnread ? 'rgba(99,102,241,0.5)' : 'rgba(255,255,255,0.08)'}; border-radius: 10px; padding: 12px 14px; display: flex; flex-direction: column; gap: 8px; transition: all 0.2s; position: relative;">
            ${isUnread ? '<div style="position:absolute;top:10px;right:10px;width:8px;height:8px;border-radius:50%;background:#38bdf8;box-shadow:0 0 6px #38bdf8;"></div>' : ''}
            <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 6px;">
              <div style="display: flex; align-items: center; gap: 8px;">
                <span style="font-size:0.68rem; padding: 2px 8px; border-radius: 12px; background: ${typeBg}; color: ${typeColor}; font-weight: 700;">${typeBadge}</span>
                <span style="font-weight: 700; font-size: 0.88rem; color: #f8fafc;">${s.name || 'Anonymous'}</span>
              </div>
              <span style="font-size: 0.72rem; color: var(--text-dim); margin-right: 18px;">${dateStr}</span>
            </div>

            <div style="display: flex; gap: 16px; flex-wrap: wrap; font-size: 0.78rem; color: var(--text-muted);">
              ${s.email ? `<span>✉️ <a href="mailto:${s.email}" style="color:#38bdf8;text-decoration:none;">${s.email}</a></span>` : ''}
              ${s.phone ? `<span>📞 <a href="tel:${s.phone}" style="color:#38bdf8;text-decoration:none;">${s.phone}</a></span>` : ''}
              ${s.page ? `<span>📄 Page: <code style="color:#a5b4fc;background:rgba(0,0,0,0.3);padding:1px 5px;border-radius:4px;">${s.page}</code></span>` : ''}
            </div>

            ${s.message ? `<div style="font-size: 0.78rem; color: #cbd5e1; background: rgba(15,23,42,0.6); padding: 8px 10px; border-radius: 6px; line-height: 1.5; border-left: 3px solid #6366f1; white-space: pre-wrap; word-break: break-word;">${s.message}</div>` : ''}

            ${(() => {
              const fileLinks = [];
              const seen = new Set();
              for (const [k, v] of Object.entries(s)) {
                if (typeof v === 'string' && (v.includes('assets/uploads/') || (k.endsWith('_url') && (v.startsWith('http') || v.startsWith('assets/'))))) {
                  if (seen.has(v)) continue;
                  seen.add(v);
                  const label = k.replace(/_url$/, '').replace(/^field_\d+_?/, '').replace(/_/g, ' ');
                  fileLinks.push(`<a href="${v}" target="_blank" rel="noopener noreferrer" style="display:inline-flex;align-items:center;gap:5px;font-size:0.75rem;padding:4px 10px;border-radius:6px;background:rgba(56,189,248,0.15);border:1px solid rgba(56,189,248,0.4);color:#38bdf8;text-decoration:none;font-weight:600;">📎 ${label || 'Uploaded Attachment'} ↗</a>`);
                }
              }
              return fileLinks.length > 0 ? `<div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:2px;">${fileLinks.join('')}</div>` : '';
            })()}

            <div style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 2px;">
              ${isUnread ? `<button class="btn-mark-item-read" data-id="${s.id}" style="font-size: 0.7rem; padding: 3px 8px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.15); background: transparent; color: var(--text-muted); cursor: pointer;">Mark Read</button>` : ''}
              <button class="btn-del-item" data-id="${s.id}" style="font-size: 0.7rem; padding: 3px 8px; border-radius: 4px; border: 1px solid rgba(239,68,68,0.3); background: rgba(239,68,68,0.1); color: #fca5a5; cursor: pointer;">Delete</button>
            </div>
          </div>
        `;
      }).join('');

      // Bind single item actions
      container.querySelectorAll('.btn-mark-item-read').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const id = btn.getAttribute('data-id');
          await fetch('api.php?action=mark_read', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id })
          });
          const item = allSubs.find(x => x.id === id);
          if (item) item.is_read = true;
          this.checkNotifications();
          renderList();
        });
      });

      container.querySelectorAll('.btn-del-item').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const id = btn.getAttribute('data-id');
          if (!confirm('Delete this submission?')) return;
          await fetch('api.php?action=delete_submission', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id })
          });
          allSubs = allSubs.filter(x => x.id !== id);
          this.checkNotifications();
          renderList();
        });
      });
    };

    const fetchSubmissions = async () => {
      try {
        const res = await fetch(`api.php?action=get_submissions&_t=${Date.now()}`);
        const data = await res.json();

        // Robust normalization: handle plain array, PowerShell { value: [...] }, or object maps
        let rawSubs = data.submissions;
        if (rawSubs && Array.isArray(rawSubs.value)) {
          allSubs = rawSubs.value;
        } else if (Array.isArray(rawSubs)) {
          allSubs = rawSubs;
        } else if (typeof rawSubs === 'object' && rawSubs !== null) {
          allSubs = Object.values(rawSubs).filter(item => item && typeof item === 'object');
        } else {
          allSubs = [];
        }

        const unreadCount = typeof data.unreadCount === 'number'
          ? data.unreadCount
          : allSubs.filter(s => !s.is_read).length;

        const subEl = modal.querySelector('#notif-modal-sub');
        if (subEl) {
          subEl.textContent = `${allSubs.length} total submission${allSubs.length !== 1 ? 's' : ''} • ${unreadCount} unread`;
        }
        renderList();
      } catch (err) {
        console.error('Error loading submissions:', err);
        modal.querySelector('#notif-list-container').innerHTML = `<div style="text-align:center;color:var(--danger);padding:30px;">Error loading submissions.</div>`;
      }
    };

    fetchSubmissions();

    // Mark All Read
    modal.querySelector('#notif-btn-mark-all').addEventListener('click', async () => {
      await fetch('api.php?action=mark_read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: '' })
      });
      allSubs.forEach(s => s.is_read = true);
      this.checkNotifications();
      renderList();
      this.canvas?.showToast('All submissions marked as read', 'success');
    });

    // Clear All
    modal.querySelector('#notif-btn-clear-all').addEventListener('click', async () => {
      if (!confirm('Are you sure you want to permanently clear all submissions?')) return;
      await fetch('api.php?action=clear_submissions');
      allSubs = [];
      this.checkNotifications();
      renderList();
      this.canvas?.showToast('All submissions cleared', 'info');
    });

    // Filter Buttons
    modal.querySelectorAll('#notif-filter-group button').forEach(btn => {
      btn.addEventListener('click', () => {
        modal.querySelectorAll('#notif-filter-group button').forEach(b => {
          b.style.background = 'var(--bg-surface)';
          b.style.color = 'var(--text-muted)';
          b.style.borderColor = 'var(--border-subtle)';
        });
        btn.style.background = 'rgba(99,102,241,0.25)';
        btn.style.color = '#fff';
        btn.style.borderColor = 'rgba(99,102,241,0.4)';
        currentFilter = btn.getAttribute('data-filter');
        renderList();
      });
    });

    // Search Input
    modal.querySelector('#notif-search-input').addEventListener('input', (e) => {
      searchQuery = e.target.value.trim();
      renderList();
    });
  }

  // --------------------------------------------------------------------------
  // CHATBOT FLOWCHART VISUAL EDITOR MODAL
  // --------------------------------------------------------------------------
  showChatbotFlowModal() {
    const currentCb = state.siteSettings?.chatbot || DEFAULT_CHATBOT_CONFIG;
    let nodes = JSON.parse(JSON.stringify(currentCb.nodes || DEFAULT_CHATBOT_CONFIG.nodes));

    const modal = document.createElement('div');
    modal.className = 'media-modal-overlay';
    modal.id = 'chatbot-flow-modal';
    modal.innerHTML = `
      <div class="media-modal-panel" style="max-width: 860px; height: 640px; display: flex; flex-direction: column;">
        <div class="media-modal-header" style="padding: 14px 18px;">
          <div style="display: flex; align-items: center; gap: 10px;">
            <span style="font-size: 1.5rem;">🌳</span>
            <div>
              <div style="font-weight: 700; font-size: 1.05rem; color: #f8fafc;">Chatbot Decision-Tree Flowchart</div>
              <div style="font-size: 0.74rem; color: var(--text-dim);">Customize bot questions, quick-reply choice buttons, and lead capture steps</div>
            </div>
          </div>
          <button class="media-modal-close" id="close-cb-flow-modal">✕</button>
        </div>

        <div style="flex: 1; overflow-y: auto; padding: 14px 18px; display: flex; flex-direction: column; gap: 14px;" id="cb-nodes-container">
          <!-- Nodes rendered here -->
        </div>

        <div class="media-modal-footer" style="padding: 10px 18px; justify-content: space-between;">
          <div style="display: flex; gap: 8px;">
            <button type="button" id="btn-add-cb-node" class="topbar-btn topbar-btn-sm" style="background: rgba(99,102,241,0.18); border-color: #6366f1; color: #a5b4fc;">
              + Add Question / Step
            </button>
            <button type="button" id="btn-restore-cb-default" class="topbar-btn topbar-btn-sm" style="color: var(--text-dim);">
              🔄 Restore Default MCLE Flow
            </button>
          </div>
          <div style="display: flex; gap: 8px;">
            <button class="topbar-btn" id="btn-cancel-cb-flow">Cancel</button>
            <button class="topbar-btn topbar-btn-publish" id="btn-save-cb-flow">Save Flowchart ✓</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const closeModal = () => modal.remove();
    modal.querySelector('#close-cb-flow-modal').addEventListener('click', closeModal);
    modal.querySelector('#btn-cancel-cb-flow').addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

    const renderNodes = () => {
      const container = modal.querySelector('#cb-nodes-container');
      container.innerHTML = '';

      const allNodeIds = nodes.map(n => n.id);

      nodes.forEach((node, nodeIdx) => {
        const card = document.createElement('div');
        card.className = 'cb-node-card';
        card.style.cssText = 'background: rgba(30,41,59,0.7); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 14px; display: flex; flex-direction: column; gap: 10px;';

        card.innerHTML = `
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 0.72rem; font-weight: 700; color: #a5b4fc; background: rgba(99,102,241,0.2); padding: 3px 8px; border-radius: 6px;">Step ID:</span>
              <input type="text" class="node-id-input" value="${node.id}" style="font-family: monospace; font-size: 0.78rem; font-weight: 700; background: var(--bg-deep); border: 1px solid var(--border-subtle); color: #38bdf8; border-radius: 4px; padding: 3px 6px; width: 140px;" ${node.id === 'start' ? 'disabled title="start is the initial entry node"' : ''} />
              ${node.id === 'start' ? '<span style="font-size:0.68rem;color:#10b981;font-weight:700;">(Entry Node)</span>' : ''}
            </div>
            ${node.id !== 'start' ? `<button class="btn-del-node" style="font-size:0.75rem;color:var(--danger);background:transparent;border:none;cursor:pointer;" title="Delete this step">🗑️ Delete Step</button>` : ''}
          </div>

          <div>
            <label class="prop-label" style="font-size:0.75rem;margin-bottom:3px;">Bot Response Message</label>
            <textarea class="node-message-input" rows="2" style="width:100%;font-size:0.78rem;padding:6px;border-radius:6px;background:var(--bg-deep);border:1px solid var(--border-subtle);color:var(--text-main);resize:vertical;">${node.message || ''}</textarea>
          </div>

          <label style="font-size: 0.78rem; color: var(--text-main); display: flex; align-items: center; gap: 6px; cursor: pointer;">
            <input type="checkbox" class="node-lead-capture-cb" ${node.isLeadCapture ? 'checked' : ''} style="cursor: pointer;" />
            <span>✍️ Include Lead Capture Form at this step (Name &amp; Phone/Email inputs)</span>
          </label>

          <!-- Choices List -->
          <div style="margin-top: 4px; padding-top: 8px; border-top: 1px dashed rgba(255,255,255,0.08);">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
              <span style="font-size:0.72rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;">Quick-Reply Choice Buttons:</span>
              <button class="btn-add-choice" style="font-size:0.7rem;padding:2px 7px;background:rgba(99,102,241,0.2);border:1px solid rgba(99,102,241,0.3);color:#a5b4fc;border-radius:4px;cursor:pointer;">+ Add Choice Button</button>
            </div>
            <div class="choices-container" style="display:flex;flex-direction:column;gap:6px;">
              ${(node.options || []).map((opt, optIdx) => `
                <div class="choice-row" style="display:flex;gap:6px;align-items:center;">
                  <input type="text" class="choice-label-input" value="${opt.label || ''}" placeholder="Button Text (e.g. 📅 Seminar Schedules)" style="flex:1;font-size:0.76rem;padding:4px 8px;border-radius:4px;border:1px solid var(--border-subtle);background:var(--bg-deep);color:var(--text-main);" />
                  <span style="font-size:0.72rem;color:var(--text-dim);">➜</span>
                  <select class="choice-next-select" style="font-size:0.74rem;padding:4px 6px;border-radius:4px;border:1px solid var(--border-subtle);background:var(--bg-deep);color:#38bdf8;width:150px;">
                    ${allNodeIds.map(nid => `<option value="${nid}" ${nid === opt.next ? 'selected' : ''}>${nid}</option>`).join('')}
                  </select>
                  <button class="btn-del-choice" data-opt-idx="${optIdx}" style="background:transparent;border:none;color:var(--danger);cursor:pointer;font-size:0.85rem;" title="Remove choice">✕</button>
                </div>
              `).join('')}
            </div>
          </div>
        `;

        // Wire inputs on this card
        card.querySelector('.node-id-input')?.addEventListener('input', (e) => {
          node.id = e.target.value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
        });
        card.querySelector('.node-message-input')?.addEventListener('input', (e) => {
          node.message = e.target.value;
        });
        card.querySelector('.node-lead-capture-cb')?.addEventListener('change', (e) => {
          node.isLeadCapture = e.target.checked;
        });
        card.querySelector('.btn-del-node')?.addEventListener('click', () => {
          nodes.splice(nodeIdx, 1);
          renderNodes();
        });

        // Choices wiring
        card.querySelectorAll('.choice-label-input').forEach((inp, idx) => {
          inp.addEventListener('input', (e) => {
            if (node.options && node.options[idx]) node.options[idx].label = e.target.value;
          });
        });
        card.querySelectorAll('.choice-next-select').forEach((sel, idx) => {
          sel.addEventListener('change', (e) => {
            if (node.options && node.options[idx]) node.options[idx].next = e.target.value;
          });
        });
        card.querySelectorAll('.btn-del-choice').forEach((btn) => {
          btn.addEventListener('click', () => {
            const idx = parseInt(btn.getAttribute('data-opt-idx'));
            node.options.splice(idx, 1);
            renderNodes();
          });
        });
        card.querySelector('.btn-add-choice')?.addEventListener('click', () => {
          if (!node.options) node.options = [];
          node.options.push({ label: 'New Option', next: 'start' });
          renderNodes();
        });

        container.appendChild(card);
      });
    };

    renderNodes();

    // Add New Question Node
    modal.querySelector('#btn-add-cb-node').addEventListener('click', () => {
      const newId = `step_${nodes.length + 1}`;
      nodes.push({
        id: newId,
        message: 'New information message...',
        options: [
          { label: '↩️ Return to Menu', next: 'start' }
        ]
      });
      renderNodes();
      const container = modal.querySelector('#cb-nodes-container');
      container.scrollTop = container.scrollHeight;
    });

    // Restore Default Flow
    modal.querySelector('#btn-restore-cb-default').addEventListener('click', () => {
      if (!confirm('Reset flowchart back to default USPF MCLE consultation tree?')) return;
      nodes = JSON.parse(JSON.stringify(DEFAULT_CHATBOT_CONFIG.nodes));
      renderNodes();
    });

    // Save Flowchart
    modal.querySelector('#btn-save-cb-flow').addEventListener('click', () => {
      const curCb = state.siteSettings?.chatbot || DEFAULT_CHATBOT_CONFIG;
      state.setSiteSetting('chatbot', { ...curCb, nodes });
      this.canvas?.showToast('🌳 Chatbot flowchart saved successfully!', 'success');
      closeModal();
    });
  }

  // --------------------------------------------------------------------------
  // PUBLISH VERSION HISTORY & 1-CLICK ROLLBACK MODAL
  // --------------------------------------------------------------------------
  async showRevisionsModal() {
    let modal = document.getElementById('revisions-modal');
    if (modal) modal.remove();

    modal = document.createElement('div');
    modal.id = 'revisions-modal';
    modal.className = 'modal-overlay animate-fade-in';
    modal.innerHTML = `
      <div class="modal-box modal-wide animate-scale-in" style="max-width: 780px;">
        <div class="modal-header">
          <div class="modal-title">
            <span>🕒</span> Publish Version History &amp; 1-Click Rollback
          </div>
          <button class="tool-icon-btn" id="close-revisions-modal">✕</button>
        </div>
        <div class="modal-body" style="padding: 20px 24px;">
          <div style="font-size: 0.85rem; color: var(--text-dim); margin-bottom: 16px; line-height: 1.5;">
            Every time you publish to live, an immutable snapshot of your entire multi-page site and settings is archived. You can inspect revisions and restore any version with 1-click.
          </div>
          <div id="revisions-loading" style="text-align: center; padding: 40px; color: var(--text-dim);">
            <span>⏳ Fetching version history...</span>
          </div>
          <div id="revisions-list" class="revisions-timeline" style="display: none;"></div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    modal.querySelector('#close-revisions-modal').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

    try {
      const res = await fetch('api.php?action=get_revisions');
      const data = await res.json();
      const loading = modal.querySelector('#revisions-loading');
      const list = modal.querySelector('#revisions-list');
      if (loading) loading.style.display = 'none';
      if (list) list.style.display = 'flex';

      const revs = data.revisions || [];
      if (revs.length === 0) {
        list.innerHTML = `
          <div style="text-align: center; padding: 48px 20px; color: var(--text-dim);">
            <div style="font-size: 2.2rem; margin-bottom: 10px;">🕒</div>
            <div style="font-weight: 700; color: #fff; font-size: 1rem; margin-bottom: 4px;">No Published Revisions Yet</div>
            <div style="font-size: 0.82rem; margin-bottom: 16px;">Publish your site for the first time to create an automatic recovery point.</div>
            <button class="topbar-btn topbar-btn-publish" id="btn-rev-publish-now" style="display: inline-flex;">
              <span>🚀</span> Publish Now
            </button>
          </div>
        `;
        list.querySelector('#btn-rev-publish-now')?.addEventListener('click', () => {
          modal.remove();
          document.getElementById('btn-publish')?.click();
        });
        return;
      }

      list.innerHTML = revs.map((r, i) => `
        <div class="revision-card ${i === 0 ? 'is-current' : ''}">
          <div style="flex: 1; min-width: 0;">
            <div class="revision-meta-title">
              <span>${r.siteName || 'Aether Site'}</span>
              ${i === 0 ? `<span style="font-size: 0.68rem; padding: 2px 8px; border-radius: 10px; background: rgba(16,185,129,0.2); color: #34d399; font-weight: 700;">Active Live Version</span>` : ''}
            </div>
            <div class="revision-meta-sub">
              <span>📅 ${r.formattedDate}</span>
              <span>📄 ${r.pageCount} Page${r.pageCount !== 1 ? 's' : ''}</span>
              <span>🧩 ${r.totalSections} Section${r.totalSections !== 1 ? 's' : ''}</span>
              <span>💾 ${(r.sizeBytes / 1024).toFixed(1)} KB</span>
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <button class="topbar-btn btn-rollback" data-id="${r.id}" data-date="${r.formattedDate}" style="padding: 6px 14px; font-size: 0.8rem; background: rgba(99,102,241,0.15); border-color: rgba(99,102,241,0.4); color: #c7d2fe;">
              <span>🔄</span> Rollback
            </button>
          </div>
        </div>
      `).join('');

      list.querySelectorAll('.btn-rollback').forEach(btn => {
        btn.addEventListener('click', async () => {
          const revId = btn.dataset.id;
          const revDate = btn.dataset.date;
          if (!confirm(`Are you sure you want to rollback to revision from ${revDate}?\n\nYour current canvas state will be restored to this snapshot.`)) return;

          btn.disabled = true;
          btn.innerHTML = '<span>⏳</span> Restoring...';
          try {
            const rbRes = await fetch('api.php?action=rollback_revision', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ revisionId: revId })
            });
            const rbData = await rbRes.json();
            if (rbData.success) {
              await state.syncFromServer(true);
              this.canvas.render();
              modal.remove();
              this.canvas.showToast(`✅ Successfully rolled back to revision ${revId}!`, 'success');
            } else {
              alert(rbData.error || 'Failed to rollback revision.');
              btn.disabled = false;
              btn.innerHTML = '<span>🔄</span> Rollback';
            }
          } catch (err) {
            alert('Network error while rolling back revision.');
            btn.disabled = false;
            btn.innerHTML = '<span>🔄</span> Rollback';
          }
        });
      });

    } catch (err) {
      const loading = modal.querySelector('#revisions-loading');
      if (loading) loading.innerHTML = `<span style="color: #f87171;">⚠️ Error loading revisions: ${err.message}</span>`;
    }
  }

  // --------------------------------------------------------------------------
  // PRE-PUBLISH SEO & HEALTH AUDIT PRE-FLIGHT SCANNER
  // --------------------------------------------------------------------------
  showSeoAuditModal() {
    let modal = document.getElementById('seo-audit-modal');
    if (modal) modal.remove();

    // Perform Live Audit
    const page = state.currentPage || {};
    const ps = page.pageSettings || state.pageSettings || {};
    const ss = state.siteSettings || {};
    const sections = page.sections || state.sections || [];

    // Collect DOM / section data
    let h1Count = 0;
    let missingAltCount = 0;
    let totalImages = 0;
    let emptyLinksCount = 0;

    sections.forEach(s => {
      const props = s.props || {};
      // H1 check
      if (s.widgetType === 'hero' || s.widgetType === 'heading') {
        if (props.tag === 'h1' || s.widgetType === 'hero') h1Count++;
      }
      // Image checks
      ['image', 'imageUrl', 'bgImage', 'logoUrl', 'speakerAvatar'].forEach(k => {
        if (props[k]) {
          totalImages++;
          if (!props.alt && !props.imageAlt) missingAltCount++;
        }
      });
      if (Array.isArray(props.galleryImages)) {
        props.galleryImages.forEach(img => {
          totalImages++;
          if (!img.alt) missingAltCount++;
        });
      }
      if (Array.isArray(props.lecturers)) {
        props.lecturers.forEach(lec => {
          if (lec.photoUrl) {
            totalImages++;
            if (!lec.name) missingAltCount++;
          }
        });
      }
      // Link checks
      ['buttonLink', 'ctaLink', 'linkUrl'].forEach(k => {
        if (props[k] === '' || props[k] === '#') emptyLinksCount++;
      });
    });

    const checks = [];
    let score = 100;

    // Check 1: Primary H1
    if (h1Count === 1) {
      checks.push({ status: 'passed', icon: '✅', title: 'Single Primary <h1> Heading', desc: 'Optimal SEO hierarchy. Found exactly 1 primary H1 heading on this page.' });
    } else if (h1Count === 0) {
      score -= 15;
      checks.push({ status: 'error', icon: '❌', title: 'Missing <h1> Heading', desc: 'No primary <h1> found. Add a Hero Banner or Heading element set to H1 for strong search engine indexing.' });
    } else {
      score -= 8;
      checks.push({ status: 'warning', icon: '⚠️', title: 'Multiple <h1> Headings Found (' + h1Count + ')', desc: 'Best SEO practice recommends having only one <h1> heading per page for clear topical hierarchy.' });
    }

    // Check 2: Page Title
    const title = (ps.pageTitle || '').trim();
    if (title.length >= 30 && title.length <= 65) {
      checks.push({ status: 'passed', icon: '✅', title: `Page Title Length (${title.length} chars)`, desc: `"${title}" is in the optimal sweet spot for Google SERP title snippets (30–65 chars).` });
    } else if (title.length > 0 && title.length < 30) {
      score -= 6;
      checks.push({ status: 'warning', icon: '⚠️', title: `Page Title is Short (${title.length} chars)`, desc: `Consider adding descriptive keywords or school name to expand: "${title}".` });
    } else if (title.length > 65) {
      score -= 5;
      checks.push({ status: 'warning', icon: '⚠️', title: `Page Title Exceeds 65 Chars (${title.length} chars)`, desc: 'Long titles may get truncated with "..." on Google search results.' });
    } else {
      score -= 20;
      checks.push({ status: 'error', icon: '❌', title: 'Missing Page Title', desc: 'Page title is empty. Set a title under the Page settings tab.' });
    }

    // Check 3: Meta Description
    const metaDesc = (ps.metaDescription || '').trim();
    if (metaDesc.length >= 100 && metaDesc.length <= 165) {
      checks.push({ status: 'passed', icon: '✅', title: `Meta Description (${metaDesc.length} chars)`, desc: 'Optimal length for search result snippet previews (100–165 chars).' });
    } else if (metaDesc.length > 0) {
      score -= 5;
      checks.push({ status: 'warning', icon: '⚠️', title: `Meta Description Length (${metaDesc.length} chars)`, desc: 'Aim for 120–160 characters for best organic search click-through rate.' });
    } else {
      score -= 12;
      checks.push({ status: 'warning', icon: '⚠️', title: 'Missing Meta Description', desc: 'No meta description found. Search engines will generate an automatic fallback snippet.' });
    }

    // Check 4: Social Share Image (OpenGraph)
    if (ps.ogImage) {
      checks.push({ status: 'passed', icon: '✅', title: 'Social Share Image (og:image)', desc: 'Banner image configured for Facebook, LinkedIn, Twitter/X, and Viber previews.' });
    } else {
      score -= 8;
      checks.push({ status: 'warning', icon: '⚠️', title: 'Missing Social Share Image', desc: 'Set an OpenGraph banner in Page Settings so link previews look rich and attractive on social media.' });
    }

    // Check 5: Image Alt Tags
    if (missingAltCount === 0 && totalImages > 0) {
      checks.push({ status: 'passed', icon: '✅', title: `Accessible Images (${totalImages} images)`, desc: 'All images contain descriptive alternative text for accessibility and image search.' });
    } else if (missingAltCount > 0) {
      score -= Math.min(15, missingAltCount * 4);
      checks.push({ status: 'warning', icon: '⚠️', title: `${missingAltCount} Image(s) Missing Alt Text`, desc: 'Add descriptive alt text to images to improve accessibility and image ranking.' });
    }

    // Check 6: Mobile Navigation & Viewport
    checks.push({ status: 'passed', icon: '✅', title: 'Mobile Viewport & Drawer Health', desc: 'Responsive viewport meta tag and automated mobile slide-out drawer are active.' });

    // Check 7: Lead Collection & Inquiries
    if (ss.notificationEmail) {
      checks.push({ status: 'passed', icon: '✅', title: `Admin Lead Alert (${ss.notificationEmail})`, desc: 'Registrations and chatbot inquiries are routed directly to admin inbox.' });
    } else {
      score -= 5;
      checks.push({ status: 'warning', icon: '⚠️', title: 'No Admin Notification Email Configured', desc: 'Set an email in Site Settings (⚙️) to receive immediate email notifications for new leads.' });
    }

    score = Math.max(10, Math.min(100, score));
    const grade = score >= 90 ? 'A+ (Excellent)' : score >= 75 ? 'B (Good)' : 'Needs Improvement';
    const scoreClass = score >= 90 ? 'score-excellent' : score >= 75 ? 'score-good' : 'score-poor';

    modal = document.createElement('div');
    modal.id = 'seo-audit-modal';
    modal.className = 'modal-overlay animate-fade-in';
    modal.innerHTML = `
      <div class="modal-box modal-wide animate-scale-in" style="max-width: 720px;">
        <div class="modal-header">
          <div class="modal-title"><span>🛡️</span> Pre-Publish SEO &amp; Health Pre-Flight Audit</div>
          <button class="tool-icon-btn" id="close-seo-modal">✕</button>
        </div>
        <div class="modal-body" style="padding: 22px;">
          <div class="seo-audit-container">
            <div class="seo-score-banner">
              <div class="seo-score-circle ${scoreClass}">
                <div>${score}%</div>
                <div class="seo-score-label">${grade}</div>
              </div>
              <div style="flex: 1;">
                <div style="font-weight: 800; font-size: 1.15rem; color: #fff; margin-bottom: 4px;">
                  Site Health &amp; Readiness Score
                </div>
                <div style="font-size: 0.82rem; color: var(--text-dim); line-height: 1.5;">
                  ${score >= 90 
                    ? '🎉 Outstanding! Your page adheres to high-performance SEO, semantic hierarchy, and mobile usability standards.' 
                    : 'Review the recommendations below to maximize your organic Google visibility and attendee engagement.'}
                </div>
              </div>
            </div>

            <div class="seo-checks-list">
              ${checks.map(c => `
                <div class="seo-check-item ${c.status}">
                  <div class="seo-check-icon">${c.icon}</div>
                  <div class="seo-check-body">
                    <div class="seo-check-title">${c.title}</div>
                    <div class="seo-check-desc">${c.desc}</div>
                  </div>
                </div>
              `).join('')}
            </div>

            <div style="display: flex; align-items: center; justify-content: space-between; padding-top: 10px; border-top: 1px solid var(--border-subtle);">
              <button class="topbar-btn" id="btn-seo-fix-settings" style="font-size: 0.85rem;">
                <span>⚙️</span> Open Page Settings
              </button>
              <button class="topbar-btn topbar-btn-publish" id="btn-seo-publish-now" style="padding: 8px 20px;">
                <span>🚀</span> Ready to Publish Live
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    modal.querySelector('#close-seo-modal').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

    modal.querySelector('#btn-seo-fix-settings').addEventListener('click', () => {
      modal.remove();
      const pageTab = document.querySelector('.sidebar-tab-btn[data-side-tab="settings"]');
      if (pageTab) pageTab.click();
    });

    modal.querySelector('#btn-seo-publish-now').addEventListener('click', () => {
      modal.remove();
      document.getElementById('btn-publish')?.click();
    });
  }
}

// Bootstrap application on window load
window.addEventListener('DOMContentLoaded', () => {
  const app = new AetherApp();
  app.start();
});
