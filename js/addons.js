/**
 * AETHERBUILDER - ADD-ONS & PLUGIN SYSTEM WITH ADD-ON MAKER
 * Enables modular widget extensions like WordPress plugins.
 * Users can create, install, toggle, export, and manage custom widgets seamlessly.
 */

import { WIDGET_REGISTRY, formatSafeCurrency, getSafeIcon } from './widgets.js';
import { state } from './state.js';

// ── 1. LIGHTWEIGHT & SAFE ADD-ON TEMPLATE COMPILER ───────────────────────────
export function compileAddonTemplate(templateStr, props = {}) {
  if (!templateStr) return '';
  let output = templateStr;

  // Process #each loops: {{#each key}} ... {{/each}}
  output = output.replace(/\{\{#each\s+([a-zA-Z0-9_]+)\}\}([\s\S]*?)\{\{\/each\}\}/g, (match, arrayKey, innerTemplate) => {
    const list = props[arrayKey];
    if (!Array.isArray(list) || list.length === 0) return '';
    return list.map((item, idx) => {
      let rowHtml = innerTemplate;
      rowHtml = rowHtml.replace(/\{\{@index\}\}/g, String(idx));
      rowHtml = rowHtml.replace(/\{\{@number\}\}/g, String(idx + 1));
      if (typeof item === 'object' && item !== null) {
        Object.entries(item).forEach(([k, v]) => {
          const valStr = v !== undefined && v !== null ? String(v) : '';
          rowHtml = rowHtml.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), valStr);
        });
      } else {
        rowHtml = rowHtml.replace(/\{\{this\}\}/g, String(item));
      }
      return rowHtml;
    }).join('');
  });

  // Process #if ... {{else}} ... /if conditionals
  output = output.replace(/\{\{#if\s+([a-zA-Z0-9_]+)\}\}([\s\S]*?)(?:\{\{else\}\}([\s\S]*?))?\{\{\/if\}\}/g, (match, key, ifBlock, elseBlock) => {
    const val = props[key];
    const isTruthy = !!val && val !== 'false' && val !== '0' && (!Array.isArray(val) || val.length > 0);
    return isTruthy ? ifBlock : (elseBlock || '');
  });

  // Process #unless ... /unless
  output = output.replace(/\{\{#unless\s+([a-zA-Z0-9_]+)\}\}([\s\S]*?)\{\{\/unless\}\}/g, (match, key, block) => {
    const val = props[key];
    const isFalsy = !val || val === 'false' || val === '0' || (Array.isArray(val) && val.length === 0);
    return isFalsy ? block : '';
  });

  // Replace single variables: {{key}}
  output = output.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (match, key) => {
    const val = props[key];
    if (val === undefined || val === null) return '';
    return String(val);
  });

  // Auto format Philippine Peso symbols
  return formatSafeCurrency(output);
}

// ── 2. PRE-BUNDLED HIGH QUALITY SAMPLE ADD-ONS ──────────────────────────────
export const STARTER_ADDONS = [
  {
    id: 'addon_notice_banner',
    name: 'Notice Alert Banner',
    category: 'addons',
    icon: '📣',
    version: '1.0.0',
    author: 'Aether Studio',
    description: 'Dismissible notification banner with pulse status, callout styles, and action button',
    enabled: true,
    defaultProps: {
      tone: 'promo',
      badgeText: 'HOT ANNOUNCEMENT',
      message: 'Exclusive early bird seminar registration slots now available. Secure your accredited credit units!',
      actionText: 'Register Now',
      actionLink: '?page=registration',
      showAction: true,
      dismissible: true,
      cardStyle: 'glass'
    },
    schema: {
      content: [
        { key: 'badgeText',   label: 'Badge Label',         type: 'text' },
        { key: 'message',     label: 'Announcement Text',   type: 'textarea' },
        { key: 'showAction',  label: 'Show Action Button',  type: 'toggle' },
        { key: 'actionText',  label: 'Button Label',        type: 'text' },
        { key: 'actionLink',  label: 'Button Link / URL',   type: 'page-link' },
        { key: 'dismissible', label: 'Allow User to Dismiss', type: 'toggle' }
      ],
      style: [
        {
          key: 'tone',
          label: 'Banner Style & Tone',
          type: 'select',
          options: [
            { label: '🔥 Promo Glow (Purple / Pink)', value: 'promo' },
            { label: 'ℹ️ Info Blue',                 value: 'info' },
            { label: '✅ Success Green',              value: 'success' },
            { label: '⚠️ Warning Amber',             value: 'warning' }
          ]
        },
        {
          key: 'cardStyle',
          label: 'Card Surface',
          type: 'select',
          options: [
            { label: 'Glassmorphism Blur', value: 'glass' },
            { label: 'Solid Card',         value: 'solid' }
          ]
        }
      ]
    },
    template: `
<div class="wb-addon-notice-banner tone-{{tone}} surface-{{cardStyle}}" id="wb-notice-{{tone}}">
  <div class="wb-notice-content">
    {{#if badgeText}}
      <span class="wb-notice-badge">{{badgeText}}</span>
    {{/if}}
    <span class="wb-notice-msg">{{message}}</span>
    {{#if showAction}}
      <a href="{{actionLink}}" class="wb-notice-btn">{{actionText}} &rarr;</a>
    {{/if}}
  </div>
  {{#if dismissible}}
    <button type="button" class="wb-notice-close" onclick="this.closest('.wb-addon-notice-banner').remove();" title="Dismiss">&times;</button>
  {{/if}}
</div>`,
    customCss: `
.wb-addon-notice-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 22px;
  border-radius: var(--radius-lg, 14px);
  margin: 12px 0;
  transition: all 0.3s ease;
  box-sizing: border-box;
}
.wb-addon-notice-banner.surface-glass {
  backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 255, 255, 0.14);
}
.wb-addon-notice-banner.surface-solid {
  background: var(--bg-card, #131b2e);
  border: 1px solid var(--border-subtle, rgba(255,255,255,0.08));
}
.wb-addon-notice-banner.tone-promo {
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.22) 0%, rgba(236, 72, 153, 0.18) 100%);
  border-color: rgba(168, 85, 247, 0.4);
  box-shadow: 0 10px 30px -10px rgba(99, 102, 241, 0.3);
}
.wb-addon-notice-banner.tone-info {
  background: rgba(14, 165, 233, 0.15);
  border-color: rgba(14, 165, 233, 0.4);
}
.wb-addon-notice-banner.tone-success {
  background: rgba(34, 197, 94, 0.15);
  border-color: rgba(34, 197, 94, 0.4);
}
.wb-addon-notice-banner.tone-warning {
  background: rgba(245, 158, 11, 0.15);
  border-color: rgba(245, 158, 11, 0.4);
}
.wb-notice-content {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  font-size: 0.92rem;
  color: #f8fafc;
}
.wb-notice-badge {
  display: inline-flex;
  align-items: center;
  padding: 3px 10px;
  border-radius: 9999px;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  background: #6366f1;
  color: #ffffff;
  text-transform: uppercase;
}
.tone-promo .wb-notice-badge {
  background: linear-gradient(135deg, #6366f1, #ec4899);
}
.wb-notice-msg {
  font-weight: 500;
  line-height: 1.4;
}
.wb-notice-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 6px 14px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.15);
  color: #ffffff;
  font-size: 0.82rem;
  font-weight: 600;
  text-decoration: none;
  border: 1px solid rgba(255, 255, 255, 0.25);
  transition: all 0.2s ease;
}
.wb-notice-btn:hover {
  background: #ffffff;
  color: #0f172a;
  transform: translateY(-1px);
}
.wb-notice-close {
  background: none;
  border: none;
  color: var(--text-dim, #94a3b8);
  font-size: 1.3rem;
  cursor: pointer;
  padding: 4px 8px;
  line-height: 1;
  border-radius: 6px;
  transition: all 0.2s ease;
}
.wb-notice-close:hover {
  color: #ffffff;
  background: rgba(255, 255, 255, 0.1);
}
`
  },
  {
    id: 'addon_step_timeline',
    name: 'Step Process Roadmap',
    category: 'addons',
    icon: '🚀',
    version: '1.0.0',
    author: 'Aether Studio',
    description: 'Visual step-by-step roadmap or onboarding flow with glowing numbers and connected track',
    enabled: true,
    defaultProps: {
      headline: 'Simple 3-Step Procedure',
      subheadline: 'Follow our guided path to full completion',
      accentColor: '#6366f1',
      steps: [
        { stepNum: '1', title: 'Submit Online Registration', desc: 'Fill out your attorney details and select your package.' },
        { stepNum: '2', title: 'Verify Deposit / Payment',   desc: 'Upload your proof of payment or GCash reference number.' },
        { stepNum: '3', title: 'Receive Confirmation Slip',  desc: 'Access your seminar link and get accredited unit credit.' }
      ]
    },
    schema: {
      content: [
        { key: 'headline',    label: 'Main Heading',     type: 'text' },
        { key: 'subheadline', label: 'Subheading',       type: 'textarea' },
        {
          key: 'steps',
          label: '🚀 Timeline Steps',
          type: 'repeater',
          itemLabel: 'Step',
          fields: [
            { key: 'stepNum', label: 'Step Number or Icon', type: 'text' },
            { key: 'title',   label: 'Step Title',          type: 'text' },
            { key: 'desc',    label: 'Step Description',    type: 'textarea' }
          ]
        }
      ],
      style: [
        { key: 'accentColor', label: 'Glow Accent Color', type: 'color', default: '#6366f1' }
      ]
    },
    template: `
<div class="wb-addon-timeline" style="--timeline-accent: {{accentColor}};">
  {{#if headline}}
    <div class="wb-timeline-header">
      <h3 class="wb-timeline-title">{{headline}}</h3>
      {{#if subheadline}}
        <p class="wb-timeline-sub">{{subheadline}}</p>
      {{/if}}
    </div>
  {{/if}}
  <div class="wb-timeline-steps">
    {{#each steps}}
      <div class="wb-timeline-step-card">
        <div class="wb-timeline-num-badge">{{stepNum}}</div>
        <div class="wb-timeline-body">
          <h4 class="wb-timeline-step-title">{{title}}</h4>
          <p class="wb-timeline-step-desc">{{desc}}</p>
        </div>
      </div>
    {{/each}}
  </div>
</div>`,
    customCss: `
.wb-addon-timeline {
  padding: 30px 20px;
  max-width: 1100px;
  margin: 0 auto;
}
.wb-timeline-header {
  text-align: center;
  margin-bottom: 36px;
}
.wb-timeline-title {
  font-size: 1.8rem;
  font-weight: 800;
  color: #ffffff;
  margin: 0 0 8px 0;
}
.wb-timeline-sub {
  font-size: 0.95rem;
  color: var(--text-muted, #94a3b8);
  margin: 0;
}
.wb-timeline-steps {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 20px;
  position: relative;
}
.wb-timeline-step-card {
  position: relative;
  background: rgba(19, 27, 46, 0.7);
  backdrop-filter: blur(14px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 16px;
  padding: 26px 22px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}
.wb-timeline-step-card:hover {
  transform: translateY(-4px);
  border-color: var(--timeline-accent, #6366f1);
  box-shadow: 0 16px 36px -12px rgba(99, 102, 241, 0.35);
}
.wb-timeline-num-badge {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: var(--timeline-accent, #6366f1);
  color: #ffffff;
  font-size: 1.2rem;
  font-weight: 800;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 6px 16px -4px var(--timeline-accent, #6366f1);
}
.wb-timeline-step-title {
  font-size: 1.1rem;
  font-weight: 700;
  color: #ffffff;
  margin: 0 0 6px 0;
}
.wb-timeline-step-desc {
  font-size: 0.88rem;
  line-height: 1.55;
  color: var(--text-dim, #94a3b8);
  margin: 0;
}
`
  }
];

// ── 3. ADDON MANAGER CLASS ──────────────────────────────────────────────────
class AddonManager {
  constructor() {
    this.addons = [];
    this.isInitialized = false;
  }

  async init() {
    if (this.isInitialized) return;
    this.isInitialized = true;

    // 1. Try fetching from server first (data/addons.json)
    let serverAddons = null;
    try {
      const apiBase = (typeof window._aetherApiBase !== 'undefined') ? window._aetherApiBase : 'api.php';
      const res = await fetch(`${apiBase}?action=get_addons&_t=${Date.now()}`);
      if (res.ok) {
        const data = await res.json();
        if (data && data.success && Array.isArray(data.addons)) {
          serverAddons = data.addons;
        } else if (data && data.success && typeof data.addons === 'string') {
          try { serverAddons = JSON.parse(data.addons); } catch {}
        }
      }
    } catch {}

    // 2. Fallback to localStorage
    let localAddons = null;
    try {
      const raw = localStorage.getItem('aether_installed_addons');
      if (raw) localAddons = JSON.parse(raw);
    } catch {}

    // Choose best source
    let source = serverAddons && serverAddons.length > 0 ? serverAddons : localAddons;

    // If still empty, seed default starter add-ons
    if (!source || !Array.isArray(source) || source.length === 0) {
      source = JSON.parse(JSON.stringify(STARTER_ADDONS));
      this.addons = source;
      this.save(false);
    } else {
      this.addons = source;
    }

    // 3. Register all enabled add-ons into WIDGET_REGISTRY
    this.registerAllEnabled();

    // 4. Inject combined custom CSS
    this.updateCss();
  }

  registerAllEnabled() {
    this.addons.forEach(addon => {
      if (addon.enabled !== false) {
        this.registerWidget(addon);
      }
    });
  }

  registerWidget(addon) {
    if (!addon || !addon.id) return;

    const widgetDef = {
      name: addon.name || 'Custom Add-On',
      category: addon.category || 'addons',
      icon: addon.icon || '🧩',
      description: addon.description || 'Custom installed add-on widget',
      isAddon: true,
      addonId: addon.id,
      version: addon.version || '1.0.0',
      author: addon.author || 'Custom',
      defaultProps: JSON.parse(JSON.stringify(addon.defaultProps || {})),
      schema: JSON.parse(JSON.stringify(addon.schema || { content: [], style: [] })),
      customJs: addon.customJs || '',
      render: function(props, options = {}) {
        return compileAddonTemplate(addon.template, props);
      },
      // Called by the canvas after the widget HTML is injected into the DOM
      mount: function(el, props) {
        if (!addon.customJs || !addon.customJs.trim()) return;
        try {
          // Wrap user code in an IIFE so their local vars are scoped
          const fn = new Function('el', 'props', `
            "use strict";
            ${addon.customJs}
            if (typeof onMount === 'function') { onMount(el, props); }
          `);
          fn(el, props);
        } catch (err) {
          console.warn('[AetherBuilder] Addon JS error in "' + addon.id + '":', err);
        }
      }
    };

    WIDGET_REGISTRY[addon.id] = widgetDef;
  }

  unregisterWidget(addonId) {
    if (WIDGET_REGISTRY[addonId]) {
      delete WIDGET_REGISTRY[addonId];
    }
  }

  async save(syncServer = true) {
    try {
      localStorage.setItem('aether_installed_addons', JSON.stringify(this.addons));
    } catch {}

    if (syncServer) {
      try {
        const apiBase = (typeof window._aetherApiBase !== 'undefined') ? window._aetherApiBase : 'api.php';
        await fetch(`${apiBase}?action=save_addons`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(this.addons)
        });
      } catch {}
    }
  }

  updateCss() {
    let styleEl = document.getElementById('aether-addons-styles');
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'aether-addons-styles';
      document.head.appendChild(styleEl);
    }
    const combinedCss = this.getAllActiveCss();
    styleEl.textContent = combinedCss;
  }

  getAllActiveCss() {
    return this.addons
      .filter(a => a.enabled !== false && a.customCss)
      .map(a => `/* Add-on: ${a.name} (${a.id}) */\n${a.customCss}`)
      .join('\n\n');
  }

  getAllActiveJs() {
    return this.addons
      .filter(a => a.enabled !== false && a.customJs && a.customJs.trim())
      .map(a => {
        // Wrap each add-on's JS so onMount is scoped and auto-called on matching elements
        return `/* ── Add-on: ${a.name} (${a.id}) ── */
(function() {
  "use strict";
  ${a.customJs}
  if (typeof onMount === 'function') {
    document.querySelectorAll('[data-addon-id="${a.id}"]').forEach(function(el) {
      try { onMount(el, JSON.parse(el.getAttribute('data-addon-props') || '{}')); } catch(e) { console.warn('[Addon JS] ${a.id}:', e); }
    });
  }
})();`;
      })
      .join('\n\n');
  }

  installAddon(addonData) {
    if (!addonData || typeof addonData !== 'object') {
      throw new Error('Invalid add-on package: must be a valid JSON object.');
    }
    if (!addonData.name || !addonData.name.trim()) {
      throw new Error('Invalid add-on package: "name" is required.');
    }
    if (!addonData.template || !addonData.template.trim()) {
      throw new Error('Invalid add-on package: "template" HTML is required.');
    }

    let id = addonData.id;
    if (!id) {
      id = 'addon_' + addonData.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    }
    addonData.id = id;
    addonData.category = addonData.category || 'addons';
    addonData.enabled = true;
    addonData.installedAt = new Date().toISOString();

    const existingIdx = this.addons.findIndex(a => a.id === id);
    if (existingIdx !== -1) {
      this.addons[existingIdx] = addonData;
    } else {
      this.addons.push(addonData);
    }

    this.registerWidget(addonData);
    this.updateCss();
    this.save(true);
    return addonData;
  }

  toggleAddon(addonId, enable) {
    const addon = this.addons.find(a => a.id === addonId);
    if (!addon) return;
    addon.enabled = !!enable;

    if (addon.enabled) {
      this.registerWidget(addon);
    } else {
      this.unregisterWidget(addonId);
    }

    this.updateCss();
    this.save(true);
  }

  deleteAddon(addonId) {
    this.unregisterWidget(addonId);
    this.addons = this.addons.filter(a => a.id !== addonId);
    this.updateCss();
    this.save(true);
  }

  exportAddon(addonId) {
    const addon = this.addons.find(a => a.id === addonId);
    if (!addon) return;
    const clean = JSON.parse(JSON.stringify(addon));
    delete clean.installedAt;

    const blob = new Blob([JSON.stringify(clean, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${addon.id}-v${addon.version || '1.0.0'}.addon.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}

export const addonManager = new AddonManager();

// ── 4. ADD-ON MAKER VISUAL STUDIO WIZARD ────────────────────────────────────
export class AddonMaker {
  static open(existingAddon = null, onSaved = null) {
    const isEdit = !!existingAddon;
    const modal = document.createElement('div');
    modal.className = 'modal-overlay animate-fade-in wb-addon-maker-modal';
    modal.style.zIndex = '99999';

    // Initial state
    const currentData = existingAddon ? JSON.parse(JSON.stringify(existingAddon)) : {
      id: 'addon_' + Date.now().toString(36),
      name: 'Custom Element',
      category: 'addons',
      icon: '🧩',
      version: '1.0.0',
      author: 'Aether Studio',
      description: 'Dynamic custom visual widget',
      defaultProps: {
        heading: 'Hello World',
        subtext: 'This is a custom built widget add-on.',
        accentColor: '#6366f1'
      },
      schema: {
        content: [
          { key: 'heading', label: 'Main Heading', type: 'text' },
          { key: 'subtext', label: 'Description', type: 'textarea' }
        ],
        style: [
          { key: 'accentColor', label: 'Accent Color', type: 'color', default: '#6366f1' }
        ]
      },
      template: `<div class="wb-custom-box" style="--accent: {{accentColor}};">\n  <h3 class="wb-custom-title">{{heading}}</h3>\n  <p class="wb-custom-desc">{{subtext}}</p>\n</div>`,
      customCss: `.wb-custom-box {\n  padding: 24px;\n  border-radius: 14px;\n  background: rgba(19, 27, 46, 0.75);\n  border: 1px solid var(--border-subtle, rgba(255,255,255,0.1));\n  box-shadow: 0 10px 25px rgba(0,0,0,0.3);\n  text-align: center;\n}\n.wb-custom-title {\n  font-size: 1.4rem;\n  font-weight: 800;\n  color: #fff;\n  margin-bottom: 8px;\n}\n.wb-custom-desc {\n  font-size: 0.92rem;\n  color: var(--text-dim, #94a3b8);\n  line-height: 1.5;\n}`
    };

    modal.innerHTML = `
      <div class="modal-box modal-wide" style="max-width: 960px; width: 95vw; max-height: 90vh; display: flex; flex-direction: column;">
        <div class="modal-header" style="padding: 16px 20px; border-bottom: 1px solid var(--border-subtle);">
          <div class="modal-title" style="display:flex;align-items:center;gap:10px;">
            <span style="font-size: 1.4rem;">🧩</span>
            <div>
              <div style="font-weight: 800; font-size: 1.1rem; color: #fff;">${isEdit ? 'Edit Add-On: ' + currentData.name : 'Aether Add-On Maker Studio'}</div>
              <div style="font-size: 0.78rem; color: #cbd5e1; margin-top: 2px;">Design, configure, preview &amp; package custom widgets for AetherBuilder</div>
            </div>
          </div>
          <button class="tool-icon-btn" id="btn-close-maker" style="font-size: 1.2rem;">✕</button>
        </div>

        <!-- Wizard Navigation Tabs -->
        <div style="display:flex;gap:4px;padding:8px 20px;background:rgba(0,0,0,0.25);border-bottom:1px solid var(--border-subtle);overflow-x:auto;">
          <button type="button" class="maker-tab-btn active" data-tab="meta">1. 📝 Identity &amp; Info</button>
          <button type="button" class="maker-tab-btn" data-tab="props">2. ⚙️ Props &amp; Controls</button>
          <button type="button" class="maker-tab-btn" data-tab="template">3. 📄 HTML Template</button>
          <button type="button" class="maker-tab-btn" data-tab="css">4. 🎨 Scoped CSS</button>
          <button type="button" class="maker-tab-btn" data-tab="js">5. ⚡ Client JS</button>
          <button type="button" class="maker-tab-btn" data-tab="preview">6. 👁️ Live Preview</button>
        </div>

        <!-- Body Area -->
        <div class="modal-body" style="flex:1;overflow-y:auto;padding:20px;">
          <!-- TAB 1: META & IDENTITY -->
          <div id="maker-tab-meta" class="maker-tab-pane active">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
              <span style="font-weight:700;font-size:0.95rem;color:#fff;">Widget Information &amp; Manifest</span>
              <div style="display:flex;align-items:center;gap:8px;">
                <label style="font-size:0.78rem;font-weight:600;color:#f1f5f9;">⚡ Load Starter Preset:</label>
                <select id="maker-preset-select" style="font-size:0.78rem;padding:4px 8px;border-radius:6px;background:var(--bg-elevated);color:#fff;border:1px solid var(--border-subtle);">
                  <option value="">-- Choose Starter --</option>
                  <option value="notice">📣 Notice Alert Banner</option>
                  <option value="timeline">🚀 Step Roadmap Timeline</option>
                  <option value="card">💎 Glass Feature Card</option>
                </select>
              </div>
            </div>

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
              <div>
                <label class="prop-label">Widget Name *</label>
                <input type="text" id="maker-name" value="${currentData.name || ''}" placeholder="e.g. Price Comparison Matrix" />
              </div>
              <div>
                <label class="prop-label">Unique Slug / ID (letters, numbers, underscore) *</label>
                <input type="text" id="maker-id" value="${currentData.id || ''}" placeholder="e.g. addon_pricing_matrix" />
              </div>
              <div style="display:grid;grid-template-columns:1fr 2fr;gap:8px;">
                <div>
                  <label class="prop-label">Icon (Emoji or SVG)</label>
                  <input type="text" id="maker-icon" value="${currentData.icon || '🧩'}" style="text-align:center;font-size:1.1rem;" />
                </div>
                <div>
                  <label class="prop-label">Category</label>
                  <input type="text" id="maker-category" value="${currentData.category || 'addons'}" placeholder="addons" />
                </div>
              </div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
                <div>
                  <label class="prop-label">Version</label>
                  <input type="text" id="maker-version" value="${currentData.version || '1.0.0'}" />
                </div>
                <div>
                  <label class="prop-label">Author / Agency</label>
                  <input type="text" id="maker-author" value="${currentData.author || 'Aether Studio'}" />
                </div>
              </div>
              <div style="grid-column: span 2;">
                <label class="prop-label">Description</label>
                <textarea id="maker-desc" rows="2" placeholder="Brief summary of what this widget does...">${currentData.description || ''}</textarea>
              </div>
            </div>
          </div>

          <!-- TAB 2: PROPS & SCHEMA -->
          <div id="maker-tab-props" class="maker-tab-pane" style="display:none;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
              <div>
                <div style="font-weight:700;font-size:0.95rem;color:#fff;">Configurable Properties &amp; Controls</div>
                <div style="font-size:0.78rem;color:#cbd5e1;margin-top:2px;">These fields will appear in the Inspector sidebar when an editor clicks this widget.</div>
              </div>
              <button type="button" id="btn-maker-add-prop" class="btn btn-sm btn-primary" style="font-size:0.78rem;font-weight:700;color:#ffffff !important;background:linear-gradient(135deg,#6366f1,#4f46e5);border:1px solid rgba(255,255,255,0.25);padding:6px 14px;box-shadow:0 2px 10px rgba(99,102,241,0.35);border-radius:6px;cursor:pointer;">
                <span style="color:#ffffff !important;">+ Add Prop</span>
              </button>
            </div>
            <div id="maker-props-list" style="display:flex;flex-direction:column;gap:10px;">
              <!-- Dynamically populated rows -->
            </div>
          </div>

          <!-- TAB 3: HTML TEMPLATE -->
          <div id="maker-tab-template" class="maker-tab-pane" style="display:none;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
              <div>
                <div style="font-weight:700;font-size:0.95rem;color:#fff;">Widget HTML Template</div>
                <div style="font-size:0.78rem;color:#cbd5e1;margin-top:2px;">Use double curly braces to output props: <code style="color:#a5b4fc;">{{variableName}}</code></div>
              </div>
            </div>
            <div style="margin-bottom:10px;padding:8px 12px;background:rgba(99,102,241,0.1);border-radius:8px;border:1px solid rgba(99,102,241,0.25);">
              <span style="font-size:0.75rem;font-weight:700;color:#c7d2fe;margin-right:8px;">Click to Insert Prop:</span>
              <span id="maker-token-pills" style="display:inline-flex;flex-wrap:wrap;gap:6px;"></span>
            </div>
            <textarea id="maker-template" rows="12" style="font-family:'JetBrains Mono',monospace;font-size:0.82rem;width:100%;resize:vertical;line-height:1.45;">${currentData.template || ''}</textarea>
          </div>

          <!-- TAB 4: SCOPED CSS -->
          <div id="maker-tab-css" class="maker-tab-pane" style="display:none;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
              <div>
                <div style="font-weight:700;font-size:0.95rem;color:#fff;">Custom Scoped CSS</div>
                <div style="font-size:0.78rem;color:#cbd5e1;margin-top:2px;">Write clean CSS for your widget. It will be loaded on the canvas and in the live site.</div>
              </div>
            </div>
            <textarea id="maker-css" rows="14" style="font-family:'JetBrains Mono',monospace;font-size:0.82rem;width:100%;resize:vertical;line-height:1.45;">${currentData.customCss || ''}</textarea>
          </div>

          <!-- TAB 5: CLIENT JS -->
          <div id="maker-tab-js" class="maker-tab-pane" style="display:none;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
              <div>
                <div style="font-weight:700;font-size:0.95rem;color:#fff;">⚡ Client-Side JavaScript</div>
                <div style="font-size:0.78rem;color:#cbd5e1;margin-top:2px;">Write an <code style="color:#fbbf24;">onMount(el, props)</code> function — called every time your widget is placed on the page.</div>
              </div>
            </div>
            <div style="margin-bottom:10px;padding:10px 14px;background:rgba(251,191,36,0.08);border-radius:8px;border:1px solid rgba(251,191,36,0.25);">
              <div style="font-size:0.74rem;font-weight:700;color:#fde68a;margin-bottom:6px;">📖 Lifecycle API</div>
              <code style="font-size:0.74rem;color:#fcd34d;white-space:pre;display:block;line-height:1.7;">function onMount(el, props) {
  // el  → the root DOM element of your widget
  // props → the resolved prop values (key/value object)
  // Write any interactive JS here:
  //   el.querySelector('.my-btn').addEventListener('click', ...)
  //   setInterval(...)
  //   fetch(...)
}</code>
            </div>
            <textarea id="maker-js" rows="14" style="font-family:'JetBrains Mono',monospace;font-size:0.82rem;width:100%;resize:vertical;line-height:1.45;" placeholder="// Write your onMount(el, props) function here...&#10;function onMount(el, props) {&#10;  // e.g. attach a click counter&#10;  var btn = el.querySelector('.my-btn');&#10;  if (btn) btn.addEventListener('click', function() {&#10;    alert('Clicked!');&#10;  });&#10;}">${currentData.customJs || ''}</textarea>
          </div>

          <!-- TAB 6: LIVE PREVIEW -->
          <div id="maker-tab-preview" class="maker-tab-pane" style="display:none;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
              <div>
                <div style="font-weight:700;font-size:0.95rem;color:#fff;">Realtime WYSIWYG Live Preview</div>
                <div style="font-size:0.78rem;color:#cbd5e1;margin-top:2px;">Verify how your template and CSS render with the default values.</div>
              </div>
              <button type="button" id="btn-refresh-preview" class="btn btn-sm" style="font-size:0.75rem;padding:5px 12px;color:#ffffff !important;background:rgba(255,255,255,0.08);border:1px solid var(--border-subtle);border-radius:6px;cursor:pointer;">
                <span style="color:#ffffff !important;">🔄 Refresh Preview</span>
              </button>
            </div>
            <div id="maker-preview-container" style="padding:24px;border-radius:12px;background:#090d16;border:1px dashed rgba(255,255,255,0.15);min-height:180px;">
              <!-- Live preview rendered here -->
            </div>
          </div>
        </div>

        <!-- Footer Actions -->
        <div class="modal-footer" style="padding:14px 20px;border-top:1px solid var(--border-subtle);display:flex;justify-content:space-between;align-items:center;background:rgba(0,0,0,0.2);">
          <div style="display:flex;align-items:center;gap:8px;">
            <button type="button" id="btn-maker-export" class="btn btn-sm" style="background:rgba(255,255,255,0.08);color:#ffffff !important;border:1px solid var(--border-subtle);padding:7px 14px;border-radius:6px;cursor:pointer;">
              <span style="color:#ffffff !important;">📦 Export .json Package</span>
            </button>
          </div>
          <div style="display:flex;align-items:center;gap:10px;">
            <button type="button" class="btn btn-sm" id="btn-maker-cancel" style="background:rgba(255,255,255,0.06);color:#cbd5e1;border:1px solid var(--border-subtle);padding:7px 14px;border-radius:6px;cursor:pointer;">Cancel</button>
            <button type="button" class="btn btn-sm btn-success" id="btn-maker-save" style="font-weight:700;font-size:0.84rem;padding:9px 20px;color:#ffffff !important;background:linear-gradient(135deg,#10b981,#059669);border:1px solid rgba(255,255,255,0.25);box-shadow:0 4px 16px rgba(16,185,129,0.45);border-radius:8px;cursor:pointer;">
              <span style="color:#ffffff !important;">🚀 Save &amp; Install Add-On</span>
            </button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Tab switcher
    const tabBtns = modal.querySelectorAll('.maker-tab-btn');
    const tabPanes = modal.querySelectorAll('.maker-tab-pane');
    tabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const targetTab = btn.getAttribute('data-tab');
        tabBtns.forEach(b => b.classList.toggle('active', b === btn));
        tabPanes.forEach(p => {
          const isTarget = p.id === `maker-tab-${targetTab}`;
          p.style.display = isTarget ? 'block' : 'none';
          p.classList.toggle('active', isTarget);
        });
        if (targetTab === 'preview') {
          renderPreview();
        }
        if (targetTab === 'template') {
          renderTokenPills();
        }
        if (targetTab === 'js') {
          // Focus the JS editor when switching to that tab
          setTimeout(() => modal.querySelector('#maker-js')?.focus(), 50);
        }
      });
    });

    // Populate Props Table
    const propsListEl = modal.querySelector('#maker-props-list');
    let propsState = [];

    // Flatten existing schema content and style
    const contentFields = (currentData.schema && currentData.schema.content) || [];
    const styleFields = (currentData.schema && currentData.schema.style) || [];
    contentFields.forEach(f => propsState.push({ ...f, section: 'content', defVal: currentData.defaultProps?.[f.key] ?? '' }));
    styleFields.forEach(f => propsState.push({ ...f, section: 'style', defVal: currentData.defaultProps?.[f.key] ?? '' }));

    if (propsState.length === 0) {
      propsState = [
        { key: 'heading', label: 'Main Heading', type: 'text', section: 'content', defVal: 'Welcome to our Seminar' },
        { key: 'accentColor', label: 'Accent Color', type: 'color', section: 'style', defVal: '#6366f1' }
      ];
    }

    const renderPropsRows = () => {
      propsListEl.innerHTML = '';
      propsState.forEach((prop, idx) => {
        const row = document.createElement('div');
        row.style.cssText = 'display:grid;grid-template-columns:1.5fr 1.5fr 1fr 1fr 1.5fr 36px;gap:8px;align-items:center;padding:8px 10px;background:rgba(255,255,255,0.03);border:1px solid var(--border-subtle);border-radius:8px;';
        row.innerHTML = `
          <div>
            <span style="font-size:0.74rem;font-weight:700;color:#e2e8f0;margin-bottom:4px;display:block;">Variable Key</span>
            <input type="text" class="prop-key-input" value="${prop.key || ''}" style="font-size:0.75rem;padding:4px 6px;font-family:monospace;" placeholder="key" />
          </div>
          <div>
            <span style="font-size:0.74rem;font-weight:700;color:#e2e8f0;margin-bottom:4px;display:block;">Label</span>
            <input type="text" class="prop-label-input" value="${prop.label || ''}" style="font-size:0.75rem;padding:4px 6px;" placeholder="Label" />
          </div>
          <div>
            <span style="font-size:0.74rem;font-weight:700;color:#e2e8f0;margin-bottom:4px;display:block;">Control Type</span>
            <select class="prop-type-select" style="font-size:0.75rem;padding:4px 6px;">
              <option value="text" ${prop.type === 'text' ? 'selected' : ''}>Text</option>
              <option value="textarea" ${prop.type === 'textarea' ? 'selected' : ''}>Textarea</option>
              <option value="color" ${prop.type === 'color' ? 'selected' : ''}>Color</option>
              <option value="number" ${prop.type === 'number' ? 'selected' : ''}>Number</option>
              <option value="toggle" ${prop.type === 'toggle' ? 'selected' : ''}>Toggle</option>
              <option value="select" ${prop.type === 'select' ? 'selected' : ''}>Select</option>
              <option value="image-picker" ${prop.type === 'image-picker' ? 'selected' : ''}>Image</option>
              <option value="page-link" ${prop.type === 'page-link' ? 'selected' : ''}>Link</option>
            </select>
          </div>
          <div>
            <span style="font-size:0.74rem;font-weight:700;color:#e2e8f0;margin-bottom:4px;display:block;">Inspector Tab</span>
            <select class="prop-sec-select" style="font-size:0.75rem;padding:4px 6px;">
              <option value="content" ${prop.section === 'content' ? 'selected' : ''}>Content</option>
              <option value="style" ${prop.section === 'style' ? 'selected' : ''}>Style</option>
            </select>
          </div>
          <div>
            <span style="font-size:0.74rem;font-weight:700;color:#e2e8f0;margin-bottom:4px;display:block;">Default Value</span>
            <input type="text" class="prop-val-input" value="${prop.defVal ?? ''}" style="font-size:0.75rem;padding:4px 6px;" placeholder="default" />
          </div>
          <div>
            <span style="font-size:0.74rem;color:transparent;display:block;margin-bottom:4px;">x</span>
            <button type="button" class="tool-icon-btn btn-del-prop" style="color:#f87171;padding:4px;" title="Remove Prop">🗑️</button>
          </div>
        `;

        // Listeners
        row.querySelector('.prop-key-input').addEventListener('input', (e) => { prop.key = e.target.value; renderTokenPills(); });
        row.querySelector('.prop-label-input').addEventListener('input', (e) => { prop.label = e.target.value; });
        row.querySelector('.prop-type-select').addEventListener('change', (e) => { prop.type = e.target.value; });
        row.querySelector('.prop-sec-select').addEventListener('change', (e) => { prop.section = e.target.value; });
        row.querySelector('.prop-val-input').addEventListener('input', (e) => { prop.defVal = e.target.value; });
        row.querySelector('.btn-del-prop').addEventListener('click', () => {
          propsState.splice(idx, 1);
          renderPropsRows();
          renderTokenPills();
        });

        propsListEl.appendChild(row);
      });
    };

    renderPropsRows();

    modal.querySelector('#btn-maker-add-prop').addEventListener('click', () => {
      propsState.push({
        key: 'newProp_' + (propsState.length + 1),
        label: 'New Property',
        type: 'text',
        section: 'content',
        defVal: ''
      });
      renderPropsRows();
      renderTokenPills();
    });

    // Token Pills in Template Tab
    const renderTokenPills = () => {
      const container = modal.querySelector('#maker-token-pills');
      if (!container) return;
      container.innerHTML = '';
      propsState.forEach(p => {
        if (!p.key) return;
        const pill = document.createElement('button');
        pill.type = 'button';
        pill.style.cssText = 'padding:2px 8px;border-radius:4px;background:rgba(99,102,241,0.2);border:1px solid rgba(99,102,241,0.4);color:#a5b4fc;font-size:0.72rem;cursor:pointer;font-family:monospace;';
        pill.textContent = `{{${p.key}}}`;
        pill.title = `Insert {{${p.key}}}`;
        pill.addEventListener('click', () => {
          const tArea = modal.querySelector('#maker-template');
          const token = `{{${p.key}}}`;
          const start = tArea.selectionStart;
          const end = tArea.selectionEnd;
          tArea.value = tArea.value.substring(0, start) + token + tArea.value.substring(end);
          tArea.selectionStart = tArea.selectionEnd = start + token.length;
          tArea.focus();
        });
        container.appendChild(pill);
      });
    };

    // Preset selector loader
    const presetSelect = modal.querySelector('#maker-preset-select');
    presetSelect.addEventListener('change', (e) => {
      const val = e.target.value;
      if (!val) return;
      const starter = STARTER_ADDONS.find(s => s.id.includes(val));
      if (starter) {
        modal.querySelector('#maker-name').value = starter.name;
        modal.querySelector('#maker-id').value = starter.id;
        modal.querySelector('#maker-icon').value = starter.icon;
        modal.querySelector('#maker-desc').value = starter.description;
        modal.querySelector('#maker-template').value = starter.template;
        modal.querySelector('#maker-css').value = starter.customCss || '';
        modal.querySelector('#maker-js').value = starter.customJs || '';

        propsState = [];
        const cF = (starter.schema && starter.schema.content) || [];
        const sF = (starter.schema && starter.schema.style) || [];
        cF.forEach(f => propsState.push({ ...f, section: 'content', defVal: starter.defaultProps?.[f.key] ?? '' }));
        sF.forEach(f => propsState.push({ ...f, section: 'style', defVal: starter.defaultProps?.[f.key] ?? '' }));
        renderPropsRows();
        renderTokenPills();
      }
    });

    // Auto slugify ID when typing Name
    const nameInput = modal.querySelector('#maker-name');
    const idInput = modal.querySelector('#maker-id');
    nameInput.addEventListener('input', () => {
      if (!isEdit && (!idInput.dataset.manual)) {
        idInput.value = 'addon_' + nameInput.value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
      }
    });
    idInput.addEventListener('input', () => { idInput.dataset.manual = 'true'; });

    // Live Preview Renderer
    const renderPreview = () => {
      const previewContainer = modal.querySelector('#maker-preview-container');
      const templateStr = modal.querySelector('#maker-template').value;
      const cssStr = modal.querySelector('#maker-css').value;

      // Build sample props
      const testProps = {};
      propsState.forEach(p => {
        if (!p.key) return;
        testProps[p.key] = p.defVal ?? '';
      });

      // Inject preview scoped CSS
      let prevStyle = document.getElementById('maker-preview-scoped-style');
      if (!prevStyle) {
        prevStyle = document.createElement('style');
        prevStyle.id = 'maker-preview-scoped-style';
        document.head.appendChild(prevStyle);
      }
      prevStyle.textContent = cssStr;

      try {
        const renderedHtml = compileAddonTemplate(templateStr, testProps);
        previewContainer.innerHTML = renderedHtml || '<span style="color:#94a3b8;font-size:0.88rem;">Template is empty.</span>';
      } catch (err) {
        previewContainer.innerHTML = `<div style="color:#f87171;font-size:0.85rem;">Preview Error: ${err.message}</div>`;
      }
    };

    modal.querySelector('#btn-refresh-preview')?.addEventListener('click', renderPreview);

    // Save and Install
    const saveAddonPackage = () => {
      const name = nameInput.value.trim();
      const id = idInput.value.trim();
      const template = modal.querySelector('#maker-template').value.trim();
      const customCss = modal.querySelector('#maker-css').value.trim();
      const customJs = modal.querySelector('#maker-js').value.trim();

      if (!name) { alert('Please provide a Widget Name.'); return null; }
      if (!id) { alert('Please provide a Unique ID.'); return null; }
      if (!template) { alert('Please write an HTML Template.'); return null; }

      // Validate JS: if provided it must define an onMount function
      if (customJs && !/function\s+onMount\s*\(/.test(customJs)) {
        const ok = confirm('⚠️ Your Client JS does not define an "onMount" function.\n\nThe code will still be saved but may not execute automatically.\n\nContinue anyway?');
        if (!ok) return null;
      }

      // Build defaultProps & schema
      const defaultProps = {};
      const schema = { content: [], style: [] };

      propsState.forEach(p => {
        if (!p.key) return;
        defaultProps[p.key] = p.type === 'number' ? (parseFloat(p.defVal) || 0) : (p.type === 'toggle' ? (p.defVal === 'true' || p.defVal === true) : p.defVal);
        const fieldItem = { key: p.key, label: p.label || p.key, type: p.type || 'text' };
        if (p.section === 'style') {
          schema.style.push(fieldItem);
        } else {
          schema.content.push(fieldItem);
        }
      });

      const pkg = {
        id,
        name,
        category: modal.querySelector('#maker-category').value.trim() || 'addons',
        icon: modal.querySelector('#maker-icon').value.trim() || '🧩',
        version: modal.querySelector('#maker-version').value.trim() || '1.0.0',
        author: modal.querySelector('#maker-author').value.trim() || 'Aether Studio',
        description: modal.querySelector('#maker-desc').value.trim(),
        enabled: true,
        defaultProps,
        schema,
        template,
        customCss,
        customJs: customJs || ''
      };

      addonManager.installAddon(pkg);
      return pkg;
    };

    modal.querySelector('#btn-maker-save').addEventListener('click', () => {
      const pkg = saveAddonPackage();
      if (pkg) {
        modal.remove();
        if (typeof onSaved === 'function') onSaved(pkg);
      }
    });

    modal.querySelector('#btn-maker-export').addEventListener('click', () => {
      const pkg = saveAddonPackage();
      if (pkg) {
        addonManager.exportAddon(pkg.id);
      }
    });

    // Close
    const closeBtn = modal.querySelector('#btn-close-maker');
    const cancelBtn = modal.querySelector('#btn-maker-cancel');
    const doClose = () => {
      modal.remove();
      const prevStyle = document.getElementById('maker-preview-scoped-style');
      if (prevStyle) prevStyle.remove();
    };
    closeBtn.addEventListener('click', doClose);
    cancelBtn.addEventListener('click', doClose);
  }
}
