/**
 * AETHERBUILDER - ADD-ONS & PLUGIN SYSTEM WITH ADD-ON MAKER
 * Enables modular widget extensions like WordPress plugins.
 * Users can create, install, toggle, export, and manage custom widgets seamlessly.
 */

import { WIDGET_REGISTRY, formatSafeCurrency, getSafeIcon } from './widgets.js';

// Admin token helper (server-side session)
function _getAdminToken() { return sessionStorage.getItem('aether_admin_token') || ''; }
import { state } from './state.js';

// ── 1. LIGHTWEIGHT & SAFE ADD-ON TEMPLATE COMPILER ───────────────────────────
// ── 1. LIGHTWEIGHT & SAFE RECURSIVE ADD-ON TEMPLATE COMPILER ─────────────────────────────
export function parseJsonProps(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const result = Array.isArray(obj) ? [...obj] : { ...obj };
  for (const [k, v] of Object.entries(result)) {
    if (typeof v === 'string') {
      const trimmed = v.trim();
      if ((trimmed.startsWith('[') && trimmed.endsWith(']')) || (trimmed.startsWith('{') && trimmed.endsWith('}'))) {
        try {
          result[k] = parseJsonProps(JSON.parse(trimmed));
        } catch (_) {}
      }
    } else if (typeof v === 'object' && v !== null) {
      result[k] = parseJsonProps(v);
    }
  }
  return result;
}

function resolveTemplateKey(key, context, parents = []) {
  if (!key) return undefined;
  const trimmed = key.trim();
  if (trimmed === 'this') {
    if (typeof context === 'object' && context !== null && 'this' in context) return context.this;
    return context;
  }
  // Handle Handlebars parent scope navigation: ../var or ../../var
  if (trimmed.startsWith('../')) {
    let parentLevels = 0;
    let cleanKey = trimmed;
    while (cleanKey.startsWith('../')) {
      parentLevels++;
      cleanKey = cleanKey.slice(3);
    }
    const targetParent = parents[parentLevels - 1];
    if (targetParent !== undefined && targetParent !== null) {
      const remainingParents = parents.slice(parentLevels);
      return resolveTemplateKey(cleanKey, targetParent, remainingParents);
    }
    return undefined;
  }
  if (typeof context === 'object' && context !== null) {
    if (trimmed in context) return context[trimmed];
    if (trimmed.includes('.')) {
      const parts = trimmed.split('.');
      let cur = parts[0] === 'this' ? context : context[parts[0]];
      parts.shift();
      while (cur !== undefined && cur !== null && parts.length > 0) {
        cur = cur[parts.shift()];
      }
      if (cur !== undefined) return cur;
    }
  }
  for (const parent of parents) {
    if (typeof parent === 'object' && parent !== null) {
      if (trimmed in parent) return parent[trimmed];
      if (trimmed.includes('.')) {
        const parts = trimmed.split('.');
        let cur = parent[parts[0]];
        if (cur !== undefined) {
          parts.shift();
          while (cur !== undefined && cur !== null && parts.length > 0) {
            cur = cur[parts.shift()];
          }
          if (cur !== undefined) return cur;
        }
      }
    }
  }
  return undefined;
}

function evaluateCondition(condStr, context, parents = []) {
  if (!condStr) return false;
  let s = condStr.trim();
  if (s.startsWith('(') && s.endsWith(')')) {
    s = s.slice(1, -1).trim();
  }

  // Handle logical helpers: and, or
  const logicMatch = s.match(/^(and|or)\s+([^\s]+)\s+([\s\S]+)$/);
  if (logicMatch) {
    const logicOp = logicMatch[1];
    const leftVal = evaluateCondition(logicMatch[2].trim(), context, parents);
    const rightVal = evaluateCondition(logicMatch[3].trim(), context, parents);
    return logicOp === 'and' ? (Boolean(leftVal) && Boolean(rightVal)) : (Boolean(leftVal) || Boolean(rightVal));
  }

  // Handle helpers: eq, ne, gt, lt
  const helperMatch = s.match(/^(eq|ne|gt|lt)\s+([^\s]+)\s+([\s\S]+)$/);
  if (helperMatch) {
    const op = helperMatch[1];
    const leftRaw = helperMatch[2];
    const rightRaw = helperMatch[3].trim();

    const parseVal = (token) => {
      const t = token.trim();
      if ((t.startsWith("'") && t.endsWith("'")) || (t.startsWith('"') && t.endsWith('"'))) {
        return t.slice(1, -1);
      }
      if (t === 'true') return true;
      if (t === 'false') return false;
      if (t === 'null') return null;
      if (t === 'undefined') return undefined;
      if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
      return resolveTemplateKey(t, context, parents);
    };

    const left = parseVal(leftRaw);
    const right = parseVal(rightRaw);

    if (op === 'eq') return left == right;
    if (op === 'ne') return left != right;
    if (op === 'gt') return Number(left) > Number(right);
    if (op === 'lt') return Number(left) < Number(right);
  }

  // Handle comparison operators: ==, !=, ===, !==, >, <
  const compMatch = s.match(/^([^\s=!<]+)\s*(===?|!==?|>=?|<=?)\s*([\s\S]+)$/);
  if (compMatch) {
    const leftToken = compMatch[1].trim();
    const op = compMatch[2].trim();
    const rightToken = compMatch[3].trim();
    const parseVal = (token) => {
      const t = token.trim();
      if ((t.startsWith("'") && t.endsWith("'")) || (t.startsWith('"') && t.endsWith('"'))) {
        return t.slice(1, -1);
      }
      if (t === 'true') return true;
      if (t === 'false') return false;
      if (t === 'null') return null;
      if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
      return resolveTemplateKey(t, context, parents);
    };
    const left = parseVal(leftToken);
    const right = parseVal(rightToken);
    if (op === '==' || op === '===') return left == right;
    if (op === '!=' || op === '!==') return left != right;
    if (op === '>') return Number(left) > Number(right);
    if (op === '<') return Number(left) < Number(right);
  }

  const val = resolveTemplateKey(s, context, parents);
  return !!val && val !== 'false' && val !== '0' && (!Array.isArray(val) || val.length > 0);
}

function parseTemplateToAst(templateStr) {
  const root = { type: 'root', children: [] };
  const stack = [root];
  let lastIndex = 0;
  // Support block tags ({{#each}}, {{/each}}), variable tags ({{name}}, {{../currencySymbol}}), and triple curlies ({{{raw}}})
  const tagRegex = /\{\{\{?\s*(?:([#\/])([a-zA-Z0-9_]+)(?:\s+([\s\S]*?))?|([a-zA-Z0-9_\.\@\/]+))\s*\}\}\}?/g;
  let match;

  while ((match = tagRegex.exec(templateStr)) !== null) {
    const textBefore = templateStr.slice(lastIndex, match.index);
    if (textBefore) {
      const current = stack[stack.length - 1];
      const targetChildren = current.inElse ? current.elseChildren : current.children;
      targetChildren.push({ type: 'text', value: textBefore });
    }
    lastIndex = tagRegex.lastIndex;

    const prefix = match[1];
    const blockCmd = match[2];
    const blockArg = (match[3] || '').trim();
    const varName = match[4];

    if (varName === 'else') {
      const current = stack[stack.length - 1];
      if (current && (current.type === 'if' || current.type === 'unless')) {
        current.inElse = true;
      }
      continue;
    }

    if (prefix === '#') {
      const newBlock = {
        type: blockCmd,
        key: blockArg,
        children: [],
        elseChildren: [],
        inElse: false
      };
      const current = stack[stack.length - 1];
      const targetChildren = current.inElse ? current.elseChildren : current.children;
      targetChildren.push(newBlock);
      stack.push(newBlock);
    } else if (prefix === '/') {
      if (stack.length > 1) {
        stack.pop();
      }
    } else if (varName) {
      const current = stack[stack.length - 1];
      const targetChildren = current.inElse ? current.elseChildren : current.children;
      targetChildren.push({ type: 'var', key: varName });
    }
  }

  const trailingText = templateStr.slice(lastIndex);
  if (trailingText) {
    const current = stack[stack.length - 1];
    const targetChildren = current.inElse ? current.elseChildren : current.children;
    targetChildren.push({ type: 'text', value: trailingText });
  }

  return root;
}

function evaluateTemplateAst(node, context, parents = [], loopMeta = {}) {
  if (node.type === 'root') {
    return node.children.map(c => evaluateTemplateAst(c, context, parents, loopMeta)).join('');
  }
  if (node.type === 'text') {
    return node.value;
  }
  if (node.type === 'var') {
    if (node.key === '@index') return String(loopMeta.index ?? '');
    if (node.key === '@number') return String((loopMeta.index ?? -1) + 1);
    const val = resolveTemplateKey(node.key, context, parents);
    if (val === undefined || val === null) return '';
    return String(val);
  }
  if (node.type === 'if') {
    const isTruthy = evaluateCondition(node.key, context, parents);
    const childrenToRender = isTruthy ? node.children : node.elseChildren;
    return childrenToRender.map(c => evaluateTemplateAst(c, context, parents, loopMeta)).join('');
  }
  if (node.type === 'unless') {
    const isTruthy = evaluateCondition(node.key, context, parents);
    const childrenToRender = !isTruthy ? node.children : node.elseChildren;
    return childrenToRender.map(c => evaluateTemplateAst(c, context, parents, loopMeta)).join('');
  }
  if (node.type === 'with') {
    const val = resolveTemplateKey(node.key, context, parents);
    if (!val || typeof val !== 'object') {
      return (node.elseChildren || []).map(c => evaluateTemplateAst(c, context, parents, loopMeta)).join('');
    }
    const nextParents = [context, ...parents];
    return node.children.map(c => evaluateTemplateAst(c, val, nextParents, loopMeta)).join('');
  }
  if (node.type === 'each') {
    const list = resolveTemplateKey(node.key, context, parents);
    if (!Array.isArray(list) || list.length === 0) {
      return (node.elseChildren || []).map(c => evaluateTemplateAst(c, context, parents, loopMeta)).join('');
    }
    const nextParents = [context, ...parents];
    return list.map((item, idx) => {
      const itemContext = (typeof item === 'object' && item !== null) ? item : { this: item };
      return node.children.map(c => evaluateTemplateAst(c, itemContext, nextParents, { index: idx, count: list.length })).join('');
    }).join('');
  }
  return '';
}

export function compileAddonTemplate(templateStr, rawProps = {}) {
  if (!templateStr) return '';
  const parsedProps = parseJsonProps(rawProps);
  const ast = parseTemplateToAst(templateStr);
  const output = evaluateTemplateAst(ast, parsedProps);
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
  },
  {
    id: 'addon_nav_dropdown',
    name: 'Navbar & Dropdown Menu',
    category: 'addons',
    icon: '🧭',
    version: '1.0.0',
    author: 'Aether Studio',
    description: 'Responsive glass navigation bar with multi-level dropdown submenus and CTA button',
    enabled: true,
    defaultProps: {
      brandName: 'AetherStudio',
      brandLink: 'index.html',
      showCta: true,
      ctaText: 'Get Started',
      ctaLink: '#',
      accentColor: '#6366f1',
      navItems: [
        { label: 'Home', link: 'index.html' },
        {
          label: 'Solutions',
          link: '#',
          children: [
            { label: 'Visual Builder', link: '#' },
            { label: 'Add-on Studio', link: '#' },
            { label: 'Cloud Hosting', link: '#' }
          ]
        },
        {
          label: 'Resources',
          link: '#',
          children: [
            { label: 'Documentation', link: '#' },
            { label: 'API Reference', link: '#' },
            { label: 'Community Forum', link: '#' }
          ]
        },
        { label: 'Pricing', link: '#pricing' },
        { label: 'Contact', link: '#contact' }
      ]
    },
    schema: {
      content: [
        { key: 'brandName', label: 'Brand / Logo Text', type: 'text' },
        { key: 'brandLink', label: 'Brand Link', type: 'page-link' },
        {
          key: 'navItems',
          label: 'Navigation Links & Dropdowns',
          type: 'repeater',
          fields: [
            { key: 'label', label: 'Item Label', type: 'text' },
            { key: 'link', label: 'Destination Link', type: 'page-link' },
            {
              key: 'children',
              label: 'Submenu (Dropdown Items)',
              type: 'repeater',
              fields: [
                { key: 'label', label: 'Sub-item Label', type: 'text' },
                { key: 'link', label: 'Sub-item Link', type: 'page-link' }
              ]
            }
          ]
        },
        { key: 'showCta', label: 'Show Action Button', type: 'toggle' },
        { key: 'ctaText', label: 'Button Label', type: 'text' },
        { key: 'ctaLink', label: 'Button Link', type: 'page-link' }
      ],
      style: [
        { key: 'accentColor', label: 'Brand Accent Color', type: 'color', default: '#6366f1' }
      ]
    },
    template: `
<header class="wb-addon-nav-bar" style="--nav-accent: {{accentColor}};">
  <div class="wb-addon-nav-container">
    <a href="{{brandLink}}" class="wb-addon-brand">{{brandName}}</a>
    <nav class="wb-addon-menu-wrap">
      <ul class="wb-addon-nav-ul">
        {{#each navItems}}
          <li class="wb-addon-nav-li {{#if children}}is-dropdown{{/if}}">
            <a href="{{link}}" class="wb-addon-nav-a">
              <span>{{label}}</span>
              {{#if children}}<span class="wb-nav-caret">▾</span>{{/if}}
            </a>
            {{#if children}}
              <ul class="wb-addon-sub-ul">
                {{#each children}}
                  <li class="wb-addon-sub-li">
                    <a href="{{link}}" class="wb-addon-sub-a">{{label}}</a>
                  </li>
                {{/each}}
              </ul>
            {{/if}}
          </li>
        {{/each}}
      </ul>
    </nav>
    {{#if showCta}}
      <div class="wb-addon-cta-wrap">
        <a href="{{ctaLink}}" class="wb-addon-cta-btn">{{ctaText}} &rarr;</a>
      </div>
    {{/if}}
  </div>
</header>`,
    customCss: `
.wb-addon-nav-bar {
  width: 100%;
  background: rgba(11, 15, 25, 0.85);
  backdrop-filter: blur(16px);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  position: relative;
  z-index: 50;
  box-sizing: border-box;
}
.wb-addon-nav-container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 14px 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
}
.wb-addon-brand {
  font-size: 1.25rem;
  font-weight: 800;
  color: #fff;
  text-decoration: none;
  letter-spacing: -0.02em;
}
.wb-addon-nav-ul {
  display: flex;
  align-items: center;
  gap: 8px;
  list-style: none;
  margin: 0;
  padding: 0;
}
.wb-addon-nav-li {
  position: relative;
}
.wb-addon-nav-a {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border-radius: 8px;
  color: #cbd5e1;
  text-decoration: none;
  font-size: 0.92rem;
  font-weight: 500;
  transition: all 0.2s ease;
}
.wb-addon-nav-a:hover {
  color: #ffffff;
  background: rgba(255, 255, 255, 0.06);
}
.wb-nav-caret {
  font-size: 0.72rem;
  transition: transform 0.2s ease;
}
.wb-addon-nav-li.is-dropdown:hover .wb-nav-caret {
  transform: rotate(180deg);
}
.wb-addon-sub-ul {
  position: absolute;
  top: 100%;
  left: 0;
  min-width: 200px;
  background: #0f172a;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 12px;
  box-shadow: 0 16px 36px -8px rgba(0, 0, 0, 0.5);
  list-style: none;
  margin: 8px 0 0 0;
  padding: 6px;
  display: none;
  opacity: 0;
  transform: translateY(6px);
  transition: opacity 0.2s ease, transform 0.2s ease;
  z-index: 100;
}
.wb-addon-nav-li.is-dropdown:hover .wb-addon-sub-ul {
  display: block;
  opacity: 1;
  transform: translateY(0);
}
.wb-addon-sub-a {
  display: block;
  padding: 8px 12px;
  border-radius: 6px;
  color: #94a3b8;
  text-decoration: none;
  font-size: 0.88rem;
  transition: all 0.15s ease;
}
.wb-addon-sub-a:hover {
  color: #ffffff;
  background: rgba(99, 102, 241, 0.18);
}
.wb-addon-cta-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 18px;
  border-radius: 8px;
  background: var(--nav-accent, #6366f1);
  color: #fff;
  text-decoration: none;
  font-weight: 600;
  font-size: 0.88rem;
  transition: filter 0.2s ease;
}
.wb-addon-cta-btn:hover {
  filter: brightness(1.15);
}
`,
    customJs: `
function onMount(el, props) {
  el.querySelectorAll('.wb-addon-nav-li.is-dropdown').forEach(function(item) {
    var link = item.querySelector('.wb-addon-nav-a');
    if (link) {
      link.addEventListener('click', function(e) {
        if (window.innerWidth <= 768 && item.querySelector('.wb-addon-sub-ul')) {
          e.preventDefault();
          var sub = item.querySelector('.wb-addon-sub-ul');
          var isOpen = sub.style.display === 'block';
          sub.style.display = isOpen ? 'none' : 'block';
          sub.style.opacity = isOpen ? '0' : '1';
        }
      });
    }
  });
}
`
  }
,
  {
    "id": "addon_interactive_tour",
    "name": "Interactive Guided Tour & Mascot",
    "category": "addons",
    "icon": "🧭",
    "version": "1.0.0",
    "author": "Aether Studio",
    "badge": "Official",
    "price": 0,
    "priceLabel": "FREE",
    "rating": 5,
    "downloads": "1.2k",
    "description": "Step-by-step interactive website walkthrough tour with spotlight highlighting, auto-scroll, customizable launcher button, and optional animated avatar mascot.",
    "features": [
      "Spotlight cutout that smoothly zooms and highlights any section or element on your site",
      "Smart auto-scroll brings any highlighted button, form, or section into view",
      "Optional animated avatar mascot (GIF/PNG) acting as your virtual guide with custom name",
      "Auto-start on first visit with localStorage memory, or on-demand via floating launcher button",
      "Keyboard accessible (Esc to exit, Arrow keys to navigate)"
    ],
    "defaultProps": {
      "tourTitle": "Welcome Walkthrough",
      "tourBadge": "GUIDED TOUR",
      "showLauncher": true,
      "launcherText": "Need Help? Take a Tour",
      "launcherIcon": "🧭",
      "launcherPosition": "bottom-right",
      "autoStart": false,
      "tourStorageKey": "aether_tour_completed",
      "showAvatar": true,
      "avatarUrl": "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExdWp3OHY4ejdzaG1xZzV4cW5uN3pxN2ZzNGlzazZpdzV4ZXFjZnNnayZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9cw/L3U7I9aFm3y7Z9X69R/giphy.gif",
      "avatarName": "Nova (Guide)",
      "avatarStyle": "presenter-right",
      "backdropOpacity": 0.75,
      "spotlightPadding": 10,
      "accentColor": "#6366f1",
      "cardTheme": "glass",
      "steps": [
        {
          "targetSelector": "header, nav, .widget-type-navbar, .canvas-section-wrapper:first-child",
          "title": "Welcome to Our Website! 👋",
          "content": "We are thrilled to welcome you. Let us take you on a quick 30-second tour to discover key features and tools available here.",
          "placement": "bottom",
          "stepIcon": "✨"
        },
        {
          "targetSelector": ".wb-registration-widget, form, .widget-type-registration_form, .wb-addon-contact-hire",
          "title": "Quick Registration & Contact 📝",
          "content": "Fill out the fields here in just 2 minutes to reserve your accreditation slot or reach our support team immediately.",
          "placement": "top",
          "stepIcon": "🚀"
        },
        {
          "targetSelector": "footer, .widget-type-footer, .wb-footer-grid, .canvas-section-wrapper:last-child",
          "title": "Stay Connected & Reach Out 📍",
          "content": "Find official accreditation guidelines, office contact numbers, and verified social channels in the footer. Enjoy your visit!",
          "placement": "top",
          "stepIcon": "🌟"
        }
      ],
      "removeGreenScreen": false,
      "greenKeyColor": "#00ff00",
      "greenKeyTolerance": 45,
      "avatarHeight": 380,
      "avatarFlip": false
    },
    "schema": {
      "content": [
        {
          "key": "tourTitle",
          "label": "🧭 Tour Title",
          "type": "text"
        },
        {
          "key": "tourBadge",
          "label": "🏷️ Header Badge Text",
          "type": "text"
        },
        {
          "key": "showLauncher",
          "label": "🔘 Show Floating Tour Button",
          "type": "toggle"
        },
        {
          "key": "launcherText",
          "label": "💬 Launcher Button Label",
          "type": "text"
        },
        {
          "key": "launcherIcon",
          "label": "Icon Emoji (when no avatar)",
          "type": "text"
        },
        {
          "key": "launcherPosition",
          "label": "📍 Floating Launcher Position",
          "type": "select",
          "options": [
            {
              "label": "Bottom Right",
              "value": "bottom-right"
            },
            {
              "label": "Bottom Left",
              "value": "bottom-left"
            },
            {
              "label": "Top Right",
              "value": "top-right"
            },
            {
              "label": "Top Left",
              "value": "top-left"
            }
          ],
          "default": "bottom-right"
        },
        {
          "key": "showAvatar",
          "label": "👤 Enable Guide Avatar / Presenter",
          "type": "toggle"
        },
        {
          "key": "avatarUrl",
          "label": "🖼️ Avatar Media URL (MP4, WebM, GIF, PNG)",
          "type": "image-picker"
        },
        {
          "key": "avatarName",
          "label": "Presenter Name (e.g. Alex, Guide)",
          "type": "text"
        },
        {
          "key": "avatarStyle",
          "label": "🧍 Mascot Presentation Style",
          "type": "select",
          "options": [
            {
              "label": "🧍 Full Standing Presenter (Bottom-Right)",
              "value": "presenter-right"
            },
            {
              "label": "🧍 Full Standing Presenter (Bottom-Left)",
              "value": "presenter-left"
            },
            {
              "label": "🧍 Beside Tour Card (Attached)",
              "value": "companion"
            },
            {
              "label": "👀 Peeking Head (Top Edge)",
              "value": "peeking"
            },
            {
              "label": "🏷️ Circle Badge (Card Header)",
              "value": "badge"
            }
          ],
          "default": "presenter-right"
        },
        {
          "key": "avatarHeight",
          "label": "📏 Presenter Height in px (e.g. 360, 400)",
          "type": "number",
          "default": 380
        },
        {
          "key": "avatarFlip",
          "label": "↔️ Mirror / Flip Character (Face Inward)",
          "type": "toggle",
          "default": false
        },
        {
          "key": "removeGreenScreen",
          "label": "🟢 Auto Remove Green Screen (Chroma-Key)",
          "type": "toggle",
          "default": false
        },
        {
          "key": "greenKeyColor",
          "label": "🎨 Green Screen Key Color",
          "type": "color",
          "default": "#00ff00"
        },
        {
          "key": "greenKeyTolerance",
          "label": "🎚️ Chroma Tolerance (10 - 80)",
          "type": "number",
          "default": 45
        },
        {
          "key": "steps",
          "label": "👣 Tour Steps",
          "type": "repeater",
          "itemLabel": "Step",
          "fields": [
            {
              "key": "targetSelector",
              "label": "🎯 Target Element CSS Selector (e.g. header, #nav, .my-btn, footer)",
              "type": "text"
            },
            {
              "key": "title",
              "label": "Step Title",
              "type": "text"
            },
            {
              "key": "content",
              "label": "Step Explanation",
              "type": "textarea"
            },
            {
              "key": "stepIcon",
              "label": "Step Icon Emoji",
              "type": "text"
            },
            {
              "key": "placement",
              "label": "Tooltip Placement",
              "type": "select",
              "options": [
                {
                  "label": "Auto (Best Fit)",
                  "value": "auto"
                },
                {
                  "label": "Bottom (Below Element)",
                  "value": "bottom"
                },
                {
                  "label": "Top (Above Element)",
                  "value": "top"
                },
                {
                  "label": "Left (Side)",
                  "value": "left"
                },
                {
                  "label": "Right (Side)",
                  "value": "right"
                }
              ],
              "default": "auto"
            }
          ]
        }
      ],
      "style": [
        {
          "key": "cardTheme",
          "label": "🎨 Card Theme",
          "type": "select",
          "options": [
            {
              "label": "Glassmorphic Dark",
              "value": "glass"
            },
            {
              "label": "Solid Elevated Dark",
              "value": "dark"
            },
            {
              "label": "Clean Modern Light",
              "value": "light"
            }
          ],
          "default": "glass"
        },
        {
          "key": "accentColor",
          "label": "Accent Highlight Color",
          "type": "color",
          "default": "#6366f1"
        },
        {
          "key": "backdropOpacity",
          "label": "Spotlight Dim Opacity (0.2 to 0.95)",
          "type": "number",
          "default": 0.75
        },
        {
          "key": "spotlightPadding",
          "label": "Spotlight Padding (px)",
          "type": "number",
          "default": 10
        }
      ],
      "advanced": [
        {
          "key": "autoStart",
          "label": "⚡ Auto-Start Tour on First Visit",
          "type": "toggle",
          "default": false
        },
        {
          "key": "tourStorageKey",
          "label": "Storage Key (to remember completion)",
          "type": "text",
          "default": "aether_tour_completed"
        }
      ]
    },
    "template": "<div class=\"wb-tour-addon-widget\" data-tour-pos=\"{{launcherPosition}}\" style=\"--tour-accent: {{accentColor}};\">\n  {{#if showLauncher}}\n  <button type=\"button\" class=\"wb-tour-launcher-btn wb-tour-launcher-{{launcherPosition}}\" aria-label=\"{{launcherText}}\">\n    {{#if (and showAvatar avatarUrl)}}\n      <div class=\"wb-tour-launcher-avatar\">\n        <img src=\"{{avatarUrl}}\" alt=\"{{avatarName}}\" />\n      </div>\n    {{else}}\n      <span class=\"wb-tour-launcher-icon\">{{launcherIcon}}</span>\n    {{/if}}\n    <span class=\"wb-tour-launcher-text\">{{launcherText}}</span>\n    <span class=\"wb-tour-launcher-pulse\"></span>\n  </button>\n  {{/if}}\n</div>",
    "customCss": "/* ── Interactive Guided Tour & Standing Presenter Styles ── */\n.wb-tour-addon-widget {\n  display: block;\n  font-family: var(--font-sans, system-ui, -apple-system, sans-serif);\n}\n\n/* Floating Launcher Button */\n.wb-tour-launcher-btn {\n  position: fixed;\n  z-index: 99990;\n  display: inline-flex;\n  align-items: center;\n  gap: 10px;\n  padding: 8px 16px 8px 10px;\n  background: rgba(15, 23, 42, 0.88);\n  backdrop-filter: blur(12px);\n  -webkit-backdrop-filter: blur(12px);\n  border: 1px solid rgba(255, 255, 255, 0.18);\n  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35), 0 0 0 1px rgba(99, 102, 241, 0.3);\n  border-radius: 9999px;\n  color: #f8fafc;\n  font-size: 0.82rem;\n  font-weight: 700;\n  cursor: pointer;\n  transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.2s, background 0.2s;\n  user-select: none;\n}\n.wb-tour-launcher-btn:hover {\n  transform: translateY(-2px) scale(1.02);\n  background: rgba(19, 27, 46, 0.98);\n  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.45), 0 0 16px var(--tour-accent, #6366f1);\n  border-color: var(--tour-accent, #6366f1);\n}\n.wb-tour-launcher-btn:active {\n  transform: translateY(0) scale(0.98);\n}\n\n.wb-tour-launcher-bottom-right { bottom: 24px; right: 24px; }\n.wb-tour-launcher-bottom-left  { bottom: 24px; left: 24px; }\n.wb-tour-launcher-top-right   { top: 24px; right: 24px; }\n.wb-tour-launcher-top-left    { top: 24px; left: 24px; }\n\n.wb-tour-launcher-avatar {\n  width: 32px;\n  height: 32px;\n  border-radius: 50%;\n  overflow: hidden;\n  background: transparent;\n  border: 1.5px solid var(--tour-accent, #6366f1);\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  flex-shrink: 0;\n}\n.wb-tour-launcher-avatar img,\n.wb-tour-launcher-avatar video,\n.wb-tour-launcher-avatar canvas {\n  width: 100%;\n  height: 100%;\n  object-fit: cover;\n  object-position: top center;\n  display: block;\n}\n.wb-tour-launcher-icon {\n  font-size: 1.15rem;\n  line-height: 1;\n}\n.wb-tour-launcher-text {\n  letter-spacing: -0.01em;\n  white-space: nowrap;\n}\n.wb-tour-launcher-pulse {\n  display: inline-block;\n  width: 7px;\n  height: 7px;\n  border-radius: 50%;\n  background: var(--tour-accent, #6366f1);\n  box-shadow: 0 0 8px var(--tour-accent, #6366f1);\n  animation: wbTourPulse 1.8s infinite;\n}\n@keyframes wbTourPulse {\n  0% { transform: scale(0.9); opacity: 0.8; }\n  50% { transform: scale(1.4); opacity: 1; box-shadow: 0 0 12px var(--tour-accent, #6366f1); }\n  100% { transform: scale(0.9); opacity: 0.8; }\n}\n\n/* ── Fullscreen Overlay & Spotlight Cutout ── */\n#wb-tour-overlay {\n  position: fixed;\n  inset: 0;\n  z-index: 999990;\n  pointer-events: auto;\n  font-family: var(--font-sans, system-ui, -apple-system, sans-serif);\n  animation: wbTourFadeIn 0.25s ease-out;\n}\n@keyframes wbTourFadeIn {\n  from { opacity: 0; }\n  to { opacity: 1; }\n}\n\n.wb-tour-spotlight-hole {\n  position: fixed;\n  border-radius: 12px;\n  pointer-events: none;\n  transition: top 0.35s cubic-bezier(0.16, 1, 0.3, 1),\n              left 0.35s cubic-bezier(0.16, 1, 0.3, 1),\n              width 0.35s cubic-bezier(0.16, 1, 0.3, 1),\n              height 0.35s cubic-bezier(0.16, 1, 0.3, 1);\n  box-shadow: 0 0 0 9999px rgba(10, 16, 32, var(--tour-opacity, 0.78)),\n              0 0 24px rgba(99, 102, 241, 0.55);\n  border: 2px solid var(--tour-accent, #6366f1);\n  outline: 2px dashed rgba(255, 255, 255, 0.35);\n  box-sizing: border-box;\n}\n\n/* ── Full Standing Presenter Mascot ── */\n.wb-tour-presenter-host {\n  position: fixed;\n  z-index: 999996;\n  pointer-events: none;\n  display: flex;\n  flex-direction: column;\n  align-items: center;\n  justify-content: flex-end;\n  filter: drop-shadow(0 20px 35px rgba(0, 0, 0, 0.65));\n  animation: wbTourPresenterFadeIn 0.4s ease-out, wbTourPresenterBreathe 3.8s ease-in-out infinite;\n  transform-origin: bottom center;\n}\n\n.wb-tour-presenter-host.wb-tour-pos-bottom-right {\n  bottom: 24px;\n  right: 60px;\n}\n\n.wb-tour-presenter-host.wb-tour-pos-bottom-left {\n  bottom: 24px;\n  left: 60px;\n}\n\n.wb-tour-presenter-host video,\n.wb-tour-presenter-host img,\n.wb-tour-presenter-host canvas {\n  display: block;\n  height: 100%;\n  width: auto;\n  max-width: 48vw;\n  object-fit: contain;\n  background: transparent;\n  transform-origin: bottom center;\n}\n\n.wb-tour-presenter-host.wb-tour-flipped video,\n.wb-tour-presenter-host.wb-tour-flipped img,\n.wb-tour-presenter-host.wb-tour-flipped canvas {\n  transform: scaleX(-1);\n}\n\n/* Floor contact soft shadow beneath presenter's feet */\n.wb-tour-presenter-host::after {\n  content: '';\n  display: block;\n  width: 70%;\n  height: 16px;\n  margin-top: -8px;\n  background: radial-gradient(ellipse at center, rgba(0, 0, 0, 0.65) 0%, rgba(0, 0, 0, 0) 72%);\n  border-radius: 50%;\n  pointer-events: none;\n}\n\n@keyframes wbTourPresenterFadeIn {\n  from { opacity: 0; transform: translateY(28px); }\n  to { opacity: 1; transform: translateY(0); }\n}\n\n@keyframes wbTourPresenterBreathe {\n  0%, 100% { transform: translateY(0) scale(1); }\n  50% { transform: translateY(-7px) scale(1.012); }\n}\n\n@media (max-width: 768px) {\n  .wb-tour-presenter-host {\n    max-height: 240px !important;\n    right: 16px !important;\n    bottom: 16px !important;\n  }\n}\n\n/* ── Tour Popover Card ── */\n.wb-tour-card {\n  position: fixed;\n  z-index: 999995;\n  width: 370px;\n  max-width: calc(100vw - 32px);\n  border-radius: 20px;\n  box-sizing: border-box;\n  padding: 22px 24px;\n  transition: top 0.35s cubic-bezier(0.16, 1, 0.3, 1),\n              left 0.35s cubic-bezier(0.16, 1, 0.3, 1),\n              opacity 0.2s, transform 0.2s;\n  box-shadow: 0 24px 50px rgba(0, 0, 0, 0.65), 0 0 1px rgba(255, 255, 255, 0.2);\n}\n\n/* Themes */\n.wb-tour-theme-glass {\n  background: rgba(19, 27, 46, 0.92);\n  backdrop-filter: blur(18px);\n  -webkit-backdrop-filter: blur(18px);\n  border: 1px solid rgba(255, 255, 255, 0.15);\n  color: #f8fafc;\n}\n.wb-tour-theme-dark {\n  background: #0f172a;\n  border: 1px solid rgba(255, 255, 255, 0.1);\n  color: #f8fafc;\n}\n.wb-tour-theme-light {\n  background: #ffffff;\n  border: 1px solid rgba(0, 0, 0, 0.1);\n  box-shadow: 0 20px 45px rgba(0, 0, 0, 0.15);\n  color: #0f172a;\n}\n\n/* Card Attached Mascot Styles (Peeking, Companion, Badge) */\n.wb-tour-avatar-container {\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  overflow: hidden;\n}\n\n.wb-tour-avatar-peeking {\n  position: absolute;\n  top: -38px;\n  left: 20px;\n  width: 58px;\n  height: 58px;\n  border-radius: 50%;\n  background: transparent;\n  border: 2.5px solid var(--tour-accent, #6366f1);\n  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.45);\n  animation: wbTourBob 2.8s ease-in-out infinite;\n}\n\n.wb-tour-avatar-companion {\n  position: absolute;\n  bottom: 0;\n  left: calc(100% + 14px);\n  height: 300px;\n  width: auto;\n  pointer-events: none;\n  filter: drop-shadow(0 12px 24px rgba(0, 0, 0, 0.45));\n  animation: wbTourPresenterBreathe 3.5s ease-in-out infinite;\n}\n.wb-tour-avatar-companion video,\n.wb-tour-avatar-companion img,\n.wb-tour-avatar-companion canvas {\n  height: 100%;\n  width: auto;\n  object-fit: contain;\n  display: block;\n}\n\n.wb-tour-avatar-badge {\n  width: 26px;\n  height: 26px;\n  border-radius: 50%;\n  overflow: hidden;\n  border: 1.5px solid var(--tour-accent, #6366f1);\n  display: inline-flex;\n  vertical-align: middle;\n  margin-right: 6px;\n  background: transparent;\n}\n.wb-tour-avatar-canvas,\n.wb-tour-avatar-media {\n  width: 100%;\n  height: 100%;\n  object-fit: cover;\n  display: block;\n}\n@keyframes wbTourBob {\n  0%, 100% { transform: translateY(0); }\n  50% { transform: translateY(-6px); }\n}\n\n/* Card Header */\n.wb-tour-card-header {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  margin-bottom: 12px;\n}\n.wb-tour-badge-pill {\n  display: inline-flex;\n  align-items: center;\n  gap: 5px;\n  padding: 3px 9px;\n  border-radius: 20px;\n  font-size: 0.68rem;\n  font-weight: 800;\n  text-transform: uppercase;\n  letter-spacing: 0.05em;\n  background: rgba(99, 102, 241, 0.18);\n  color: #c7d2fe;\n  border: 1px solid rgba(99, 102, 241, 0.35);\n}\n.wb-tour-step-counter {\n  font-size: 0.72rem;\n  font-weight: 700;\n  color: #94a3b8;\n}\n.wb-tour-close-btn {\n  background: none;\n  border: none;\n  color: #94a3b8;\n  cursor: pointer;\n  font-size: 1.1rem;\n  padding: 2px 6px;\n  border-radius: 6px;\n  line-height: 1;\n  transition: color 0.15s, background 0.15s;\n}\n.wb-tour-close-btn:hover {\n  color: #f87171;\n  background: rgba(239, 68, 68, 0.1);\n}\n\n/* Card Content */\n.wb-tour-card-title {\n  font-size: 1.05rem;\n  font-weight: 800;\n  margin: 0 0 8px 0;\n  line-height: 1.3;\n  letter-spacing: -0.02em;\n}\n.wb-tour-card-desc {\n  font-size: 0.84rem;\n  line-height: 1.55;\n  color: #cbd5e1;\n  margin: 0 0 16px 0;\n}\n.wb-tour-theme-light .wb-tour-card-desc {\n  color: #475569;\n}\n\n/* Progress Dots */\n.wb-tour-progress-bar {\n  display: flex;\n  align-items: center;\n  gap: 6px;\n  margin-bottom: 16px;\n}\n.wb-tour-dot {\n  width: 7px;\n  height: 7px;\n  border-radius: 50%;\n  background: rgba(255, 255, 255, 0.2);\n  transition: all 0.25s ease;\n}\n.wb-tour-theme-light .wb-tour-dot {\n  background: rgba(0, 0, 0, 0.15);\n}\n.wb-tour-dot.active {\n  width: 22px;\n  border-radius: 4px;\n  background: var(--tour-accent, #6366f1);\n  box-shadow: 0 0 8px var(--tour-accent, #6366f1);\n}\n\n/* Card Actions */\n.wb-tour-card-actions {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 8px;\n  padding-top: 10px;\n  border-top: 1px solid rgba(255, 255, 255, 0.08);\n}\n.wb-tour-theme-light .wb-tour-card-actions {\n  border-top: 1px solid rgba(0, 0, 0, 0.08);\n}\n.wb-tour-skip-btn {\n  background: none;\n  border: none;\n  color: #94a3b8;\n  font-size: 0.76rem;\n  font-weight: 600;\n  cursor: pointer;\n  padding: 6px 10px;\n  border-radius: 6px;\n  transition: color 0.15s;\n}\n.wb-tour-skip-btn:hover {\n  color: #ffffff;\n}\n.wb-tour-nav-btns {\n  display: flex;\n  align-items: center;\n  gap: 6px;\n}\n.wb-tour-btn {\n  padding: 7px 14px;\n  border-radius: 8px;\n  font-size: 0.78rem;\n  font-weight: 700;\n  cursor: pointer;\n  border: none;\n  transition: all 0.15s ease;\n}\n.wb-tour-btn-back {\n  background: rgba(255, 255, 255, 0.08);\n  color: #cbd5e1;\n  border: 1px solid rgba(255, 255, 255, 0.12);\n}\n.wb-tour-theme-light .wb-tour-btn-back {\n  background: #f1f5f9;\n  color: #475569;\n  border: 1px solid #e2e8f0;\n}\n.wb-tour-btn-back:hover:not(:disabled) {\n  background: rgba(255, 255, 255, 0.15);\n  color: #ffffff;\n}\n.wb-tour-btn-back:disabled {\n  opacity: 0.35;\n  cursor: not-allowed;\n}\n.wb-tour-btn-next {\n  background: var(--tour-accent, #6366f1);\n  color: #ffffff;\n  box-shadow: 0 4px 14px rgba(99, 102, 241, 0.4);\n}\n.wb-tour-btn-next:hover {\n  filter: brightness(1.1);\n  transform: translateY(-1px);\n}\n.wb-tour-btn-next:active {\n  transform: translateY(0);\n}",
    "customJs": "function onMount(el, props) {\n  var root = el.querySelector('.wb-tour-addon-widget');\n  if (!root) return;\n\n  var esc = function (s) {\n    return String(s == null ? '' : s).replace(/[&<>\"']/g, function (c) {\n      return {'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',\"'\":'&#39;'}[c];\n    });\n  };\n\n  var steps = Array.isArray(props.steps) ? props.steps : [];\n  if (steps.length === 0) {\n    steps = [\n      { targetSelector: 'header, nav, .widget-type-navbar', title: 'Welcome! 👋', content: 'Explore our top navigation to discover sections and services.', placement: 'bottom' },\n      { targetSelector: '.wb-registration-widget, form, .widget-type-registration_form', title: 'Quick Registration 📝', content: 'Complete this form to reserve your slot instantly.', placement: 'top' },\n      { targetSelector: 'footer, .widget-type-footer', title: 'Contact & Support 📍', content: 'Find official contact details, addresses, and social links here.', placement: 'top' }\n    ];\n  }\n\n  var currentStep = 0;\n  var overlayEl = null;\n  var spotlightEl = null;\n  var cardEl = null;\n  var presenterHostEl = null;\n  var isTourActive = false;\n  var activeCleanups = [];\n\n  var accentColor = props.accentColor || '#6366f1';\n  var cardTheme = props.cardTheme || 'glass';\n  var backdropOpacity = parseFloat(props.backdropOpacity) || 0.75;\n  var spotlightPad = parseInt(props.spotlightPadding) || 10;\n  var showAvatar = props.showAvatar !== false && props.showAvatar !== 'false';\n  var avatarUrl = (props.avatarUrl || '').trim();\n  var avatarName = esc(props.avatarName || 'Guide');\n  var avatarStyle = props.avatarStyle || 'presenter-right';\n  var avatarHeight = parseInt(props.avatarHeight) || 380;\n  var avatarFlip = props.avatarFlip === true || props.avatarFlip === 'true';\n  var removeGreen = props.removeGreenScreen === true || props.removeGreenScreen === 'true';\n  var greenColor = props.greenKeyColor || '#00ff00';\n  var greenTol = parseFloat(props.greenKeyTolerance) || 45;\n  var tourBadge = esc(props.tourBadge || 'GUIDED TOUR');\n  var storageKey = props.tourStorageKey || 'aether_tour_completed';\n\n  root.style.setProperty('--tour-accent', accentColor);\n\n  // ── Helper: Create Avatar Node with MP4 Video and Chroma-Key Support ──\n  function createAvatarNode(url, name, style, isGreen, keyHex, tolVal, targetH) {\n    var wrapper = document.createElement('div');\n    wrapper.className = 'wb-tour-avatar-container wb-tour-avatar-' + style;\n    if (!url) return wrapper;\n\n    var isVideo = /\\.(mp4|webm|ogg|mov)(\\?.*)?$/i.test(url);\n\n    if (isVideo) {\n      var video = document.createElement('video');\n      video.src = url;\n      video.autoplay = true;\n      video.loop = true;\n      video.muted = true;\n      video.playsInline = true;\n      video.setAttribute('playsinline', '');\n      video.setAttribute('webkit-playsinline', '');\n      video.crossOrigin = 'anonymous';\n\n      if (isGreen) {\n        var canvas = document.createElement('canvas');\n        canvas.className = 'wb-tour-avatar-canvas';\n        wrapper.appendChild(canvas);\n\n        var hex = keyHex.replace('#', '');\n        if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];\n        var num = parseInt(hex, 16) || 0x00ff00;\n        var targetR = (num >> 16) & 255;\n        var targetG = (num >> 8) & 255;\n        var targetB = num & 255;\n        var feather = 12;\n\n        var animId = null;\n        var ctx = null;\n\n        var renderLoop = function () {\n          if (!video || video.paused || video.ended) return;\n          if (video.videoWidth && video.videoHeight) {\n            if (!ctx) ctx = canvas.getContext('2d', { willReadFrequently: true });\n            var w = video.videoWidth;\n            var h = video.videoHeight;\n            if (canvas.width !== w || canvas.height !== h) {\n              var maxDim = Math.max(480, targetH || 380);\n              var scale = Math.min(1, maxDim / Math.max(w, h));\n              canvas.width = Math.round(w * scale);\n              canvas.height = Math.round(h * scale);\n            }\n\n            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);\n            var frame = ctx.getImageData(0, 0, canvas.width, canvas.height);\n            var d = frame.data;\n            var len = d.length;\n\n            for (var i = 0; i < len; i += 4) {\n              var r = d[i], g = d[i + 1], b = d[i + 2];\n              var dist = Math.sqrt((r - targetR) * (r - targetR) + (g - targetG) * (g - targetG) + (b - targetB) * (b - targetB));\n              var norm = (dist / 441.67) * 100;\n\n              if (norm < tolVal - feather) {\n                d[i + 3] = 0;\n              } else if (norm < tolVal) {\n                d[i + 3] = Math.round(((norm - (tolVal - feather)) / feather) * 255);\n                var maxOther = Math.max(r, b);\n                if (g > maxOther) d[i + 1] = maxOther;\n              } else if (g > targetG * 0.7 && g > r * 1.25 && g > b * 1.25) {\n                d[i + 1] = Math.max(r, b);\n              }\n            }\n            ctx.putImageData(frame, 0, 0);\n          }\n          animId = requestAnimationFrame(renderLoop);\n        };\n\n        video.addEventListener('play', function () {\n          cancelAnimationFrame(animId);\n          animId = requestAnimationFrame(renderLoop);\n        });\n\n        var cleanup = function () {\n          cancelAnimationFrame(animId);\n          video.pause();\n          video.src = '';\n        };\n        wrapper.__cleanup = cleanup;\n        activeCleanups.push(cleanup);\n\n        video.play().catch(function () {});\n      } else {\n        video.className = 'wb-tour-avatar-media';\n        wrapper.appendChild(video);\n        var cleanupSimple = function () {\n          video.pause();\n          video.src = '';\n        };\n        wrapper.__cleanup = cleanupSimple;\n        activeCleanups.push(cleanupSimple);\n        video.play().catch(function () {});\n      }\n    } else {\n      // Standard image / GIF\n      if (isGreen) {\n        var img = new Image();\n        img.crossOrigin = 'anonymous';\n        img.src = url;\n\n        var canvasImg = document.createElement('canvas');\n        canvasImg.className = 'wb-tour-avatar-canvas';\n        wrapper.appendChild(canvasImg);\n\n        img.onload = function () {\n          var ctxImg = canvasImg.getContext('2d', { willReadFrequently: true });\n          var maxDim = Math.max(480, targetH || 380);\n          var scale = Math.min(1, maxDim / Math.max(img.width, img.height));\n          canvasImg.width = Math.round(img.width * scale);\n          canvasImg.height = Math.round(img.height * scale);\n\n          ctxImg.drawImage(img, 0, 0, canvasImg.width, canvasImg.height);\n          var frame = ctxImg.getImageData(0, 0, canvasImg.width, canvasImg.height);\n          var d = frame.data;\n          var len = d.length;\n\n          var hex = keyHex.replace('#', '');\n          if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];\n          var num = parseInt(hex, 16) || 0x00ff00;\n          var targetR = (num >> 16) & 255;\n          var targetG = (num >> 8) & 255;\n          var targetB = num & 255;\n          var feather = 12;\n\n          for (var i = 0; i < len; i += 4) {\n            var r = d[i], g = d[i + 1], b = d[i + 2];\n            var dist = Math.sqrt((r - targetR) * (r - targetR) + (g - targetG) * (g - targetG) + (b - targetB) * (b - targetB));\n            var norm = (dist / 441.67) * 100;\n\n            if (norm < tolVal - feather) {\n              d[i + 3] = 0;\n            } else if (norm < tolVal) {\n              d[i + 3] = Math.round(((norm - (tolVal - feather)) / feather) * 255);\n              var maxOther = Math.max(r, b);\n              if (g > maxOther) d[i + 1] = maxOther;\n            }\n          }\n          ctxImg.putImageData(frame, 0, 0);\n        };\n      } else {\n        var imgTag = document.createElement('img');\n        imgTag.className = 'wb-tour-avatar-media';\n        imgTag.src = url;\n        imgTag.alt = name;\n        wrapper.appendChild(imgTag);\n      }\n    }\n\n    return wrapper;\n  }\n\n  function clearActiveCleanups() {\n    for (var i = 0; i < activeCleanups.length; i++) {\n      try { activeCleanups[i](); } catch (_) {}\n    }\n    activeCleanups = [];\n  }\n\n  function createOverlay() {\n    if (document.getElementById('wb-tour-overlay')) {\n      document.getElementById('wb-tour-overlay').remove();\n    }\n\n    overlayEl = document.createElement('div');\n    overlayEl.id = 'wb-tour-overlay';\n    overlayEl.style.setProperty('--tour-accent', accentColor);\n    overlayEl.style.setProperty('--tour-opacity', backdropOpacity);\n\n    spotlightEl = document.createElement('div');\n    spotlightEl.className = 'wb-tour-spotlight-hole';\n    overlayEl.appendChild(spotlightEl);\n\n    // If Standing Presenter mode (bottom-right or bottom-left)\n    if (showAvatar && avatarUrl && (avatarStyle === 'presenter-right' || avatarStyle === 'presenter-left')) {\n      presenterHostEl = document.createElement('div');\n      var posClass = avatarStyle === 'presenter-left' ? 'wb-tour-pos-bottom-left' : 'wb-tour-pos-bottom-right';\n      presenterHostEl.className = 'wb-tour-presenter-host ' + posClass + (avatarFlip ? ' wb-tour-flipped' : '');\n      presenterHostEl.style.height = avatarHeight + 'px';\n\n      var presNode = createAvatarNode(avatarUrl, avatarName, 'presenter', removeGreen, greenColor, greenTol, avatarHeight);\n      presenterHostEl.appendChild(presNode);\n      overlayEl.appendChild(presenterHostEl);\n    }\n\n    cardEl = document.createElement('div');\n    cardEl.className = 'wb-tour-card wb-tour-theme-' + cardTheme;\n    overlayEl.appendChild(cardEl);\n\n    document.body.appendChild(overlayEl);\n\n    window.addEventListener('keydown', onKeyDown);\n    window.addEventListener('resize', onViewportChange);\n    window.addEventListener('scroll', onViewportChange, true);\n  }\n\n  function removeOverlay() {\n    isTourActive = false;\n    clearActiveCleanups();\n    window.removeEventListener('keydown', onKeyDown);\n    window.removeEventListener('resize', onViewportChange);\n    window.removeEventListener('scroll', onViewportChange, true);\n\n    if (overlayEl) {\n      overlayEl.remove();\n      overlayEl = null;\n      spotlightEl = null;\n      cardEl = null;\n      presenterHostEl = null;\n    }\n  }\n\n  function onKeyDown(e) {\n    if (!isTourActive) return;\n    if (e.key === 'Escape') {\n      endTour(false);\n    } else if (e.key === 'ArrowRight' || e.key === 'Enter') {\n      nextStep();\n    } else if (e.key === 'ArrowLeft') {\n      prevStep();\n    }\n  }\n\n  var scrollTimer = null;\n  function onViewportChange() {\n    if (!isTourActive) return;\n    clearTimeout(scrollTimer);\n    scrollTimer = setTimeout(function () {\n      updatePositions(currentStep);\n    }, 40);\n  }\n\n  function findTargetElement(selector) {\n    if (!selector) return null;\n    var selectors = selector.split(',').map(function (s) { return s.trim(); }).filter(Boolean);\n    for (var i = 0; i < selectors.length; i++) {\n      var found = document.querySelector(selectors[i]);\n      if (found && found.offsetParent !== null) return found;\n    }\n    return null;\n  }\n\n  function updatePositions(stepIdx) {\n    if (!isTourActive || !cardEl || !spotlightEl) return;\n    var step = steps[stepIdx];\n    if (!step) return;\n\n    var target = findTargetElement(step.targetSelector);\n    var rect;\n\n    if (target) {\n      rect = target.getBoundingClientRect();\n      var top = Math.max(4, rect.top - spotlightPad);\n      var left = Math.max(4, rect.left - spotlightPad);\n      var width = rect.width + (spotlightPad * 2);\n      var height = rect.height + (spotlightPad * 2);\n\n      spotlightEl.style.top = top + 'px';\n      spotlightEl.style.left = left + 'px';\n      spotlightEl.style.width = width + 'px';\n      spotlightEl.style.height = height + 'px';\n      spotlightEl.style.display = 'block';\n    } else {\n      var w = 180, h = 90;\n      var cx = (window.innerWidth / 2) - (w / 2);\n      var cy = (window.innerHeight / 2) - (h / 2);\n      spotlightEl.style.top = cy + 'px';\n      spotlightEl.style.left = cx + 'px';\n      spotlightEl.style.width = w + 'px';\n      spotlightEl.style.height = h + 'px';\n      spotlightEl.style.display = 'none';\n      rect = { top: cy, bottom: cy + h, left: cx, right: cx + w, width: w, height: h };\n    }\n\n    var placement = step.placement || 'auto';\n    var cardW = cardEl.offsetWidth || 370;\n    var cardH = cardEl.offsetHeight || 220;\n    var cTop, cLeft;\n\n    if (placement === 'auto') {\n      var spaceBelow = window.innerHeight - rect.bottom;\n      var spaceAbove = rect.top;\n      placement = (spaceBelow >= cardH + 24) ? 'bottom' : (spaceAbove >= cardH + 24 ? 'top' : 'bottom');\n    }\n\n    if (placement === 'bottom') {\n      cTop = rect.bottom + 16;\n      cLeft = rect.left + (rect.width / 2) - (cardW / 2);\n    } else if (placement === 'top') {\n      cTop = rect.top - cardH - 16;\n      cLeft = rect.left + (rect.width / 2) - (cardW / 2);\n    } else if (placement === 'right' && rect.right + cardW + 20 < window.innerWidth) {\n      cTop = rect.top + (rect.height / 2) - (cardH / 2);\n      cLeft = rect.right + 16;\n    } else if (placement === 'left' && rect.left - cardW - 20 > 0) {\n      cTop = rect.top + (rect.height / 2) - (cardH / 2);\n      cLeft = rect.left - cardW - 16;\n    } else {\n      cTop = (window.innerHeight / 2) - (cardH / 2);\n      cLeft = (window.innerWidth / 2) - (cardW / 2);\n    }\n\n    // Viewport Boundary Clamping\n    cLeft = Math.max(16, Math.min(window.innerWidth - cardW - 16, cLeft));\n    cTop = Math.max(48, Math.min(window.innerHeight - cardH - 16, cTop));\n\n    cardEl.style.top = Math.round(cTop) + 'px';\n    cardEl.style.left = Math.round(cLeft) + 'px';\n  }\n\n  function renderCardContent(step, idx) {\n    var isLast = idx === steps.length - 1;\n    var isFirst = idx === 0;\n\n    // Clean up card-attached video instances\n    var oldCardCleanups = cardEl.querySelectorAll('.wb-tour-avatar-container');\n    oldCardCleanups.forEach(function (c) {\n      if (typeof c.__cleanup === 'function') c.__cleanup();\n    });\n\n    // Dots HTML\n    var dotsHtml = '<div class=\"wb-tour-progress-bar\">';\n    for (var i = 0; i < steps.length; i++) {\n      dotsHtml += '<span class=\"wb-tour-dot ' + (i === idx ? 'active' : '') + '\"></span>';\n    }\n    dotsHtml += '</div>';\n\n    var iconHtml = step.stepIcon ? '<span style=\"font-size:1.15rem;margin-right:6px;\">' + esc(step.stepIcon) + '</span>' : '';\n\n    cardEl.innerHTML =\n      '<div class=\"wb-tour-card-header\">' +\n        '<span class=\"wb-tour-badge-pill\"><span class=\"wb-tour-avatar-slot\"></span>' + tourBadge + '</span>' +\n        '<span class=\"wb-tour-step-counter\">Step ' + (idx + 1) + ' of ' + steps.length + '</span>' +\n        '<button type=\"button\" class=\"wb-tour-close-btn\" title=\"Exit Tour\">✕</button>' +\n      '</div>' +\n      '<h4 class=\"wb-tour-card-title\">' + iconHtml + esc(step.title || 'Step ' + (idx + 1)) + '</h4>' +\n      '<p class=\"wb-tour-card-desc\">' + esc(step.content || '') + '</p>' +\n      dotsHtml +\n      '<div class=\"wb-tour-card-actions\">' +\n        '<button type=\"button\" class=\"wb-tour-skip-btn\">Skip Tour</button>' +\n        '<div class=\"wb-tour-nav-btns\">' +\n          '<button type=\"button\" class=\"wb-tour-btn wb-tour-btn-back\" ' + (isFirst ? 'disabled' : '') + '>Back</button>' +\n          '<button type=\"button\" class=\"wb-tour-btn wb-tour-btn-next\">' + (isLast ? 'Finish 🎉' : 'Next →') + '</button>' +\n        '</div>' +\n      '</div>';\n\n    // Inject Avatar into card ONLY if style is card-attached (badge, peeking, companion)\n    if (showAvatar && avatarUrl && (avatarStyle === 'badge' || avatarStyle === 'peeking' || avatarStyle === 'companion')) {\n      var avatarNode = createAvatarNode(avatarUrl, avatarName, avatarStyle, removeGreen, greenColor, greenTol, 200);\n      if (avatarStyle === 'badge') {\n        var slot = cardEl.querySelector('.wb-tour-avatar-slot');\n        if (slot) slot.appendChild(avatarNode);\n      } else {\n        cardEl.insertBefore(avatarNode, cardEl.firstChild);\n      }\n    }\n\n    cardEl.querySelector('.wb-tour-close-btn').onclick = function () { endTour(false); };\n    cardEl.querySelector('.wb-tour-skip-btn').onclick = function () { endTour(false); };\n    cardEl.querySelector('.wb-tour-btn-back').onclick = function () { prevStep(); };\n    cardEl.querySelector('.wb-tour-btn-next').onclick = function () {\n      if (isLast) {\n        endTour(true);\n      } else {\n        nextStep();\n      }\n    };\n  }\n\n  function goToStep(idx) {\n    if (idx < 0 || idx >= steps.length) return;\n    currentStep = idx;\n\n    var step = steps[idx];\n    var target = findTargetElement(step.targetSelector);\n\n    if (target) {\n      try {\n        target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });\n      } catch (_) {}\n    }\n\n    renderCardContent(step, idx);\n\n    setTimeout(function () {\n      updatePositions(idx);\n    }, 150);\n  }\n\n  function nextStep() {\n    if (currentStep < steps.length - 1) {\n      goToStep(currentStep + 1);\n    } else {\n      endTour(true);\n    }\n  }\n\n  function prevStep() {\n    if (currentStep > 0) {\n      goToStep(currentStep - 1);\n    }\n  }\n\n  function startTour() {\n    if (steps.length === 0) return;\n    isTourActive = true;\n    createOverlay();\n    goToStep(0);\n  }\n\n  function endTour(completed) {\n    removeOverlay();\n    if (completed && storageKey) {\n      try {\n        localStorage.setItem(storageKey, 'true');\n      } catch (_) {}\n    }\n    if (completed && window.aetherApp && window.aetherApp.canvas && typeof window.aetherApp.canvas.showToast === 'function') {\n      window.aetherApp.canvas.showToast('🎉 Tour completed! Welcome aboard.', 'success');\n    }\n  }\n\n  // Wire Launcher Button & Thumbnail Avatar\n  var launcherBtn = root.querySelector('.wb-tour-launcher-btn');\n  if (launcherBtn) {\n    launcherBtn.addEventListener('click', function (e) {\n      e.stopPropagation();\n      startTour();\n    });\n\n    if (showAvatar && avatarUrl) {\n      var launcherSlot = launcherBtn.querySelector('.wb-tour-launcher-avatar');\n      if (launcherSlot) {\n        launcherSlot.innerHTML = '';\n        var launcherAvatar = createAvatarNode(avatarUrl, avatarName, 'launcher', removeGreen, greenColor, greenTol, 64);\n        launcherSlot.appendChild(launcherAvatar);\n      }\n    }\n  }\n\n  // Auto-Start Check\n  if (props.autoStart === true || props.autoStart === 'true') {\n    var alreadyDone = false;\n    try {\n      alreadyDone = !!localStorage.getItem(storageKey);\n    } catch (_) {}\n\n    if (!alreadyDone) {\n      setTimeout(function () {\n        if (!isTourActive) startTour();\n      }, 1000);\n    }\n  }\n\n  // Teardown\n  el.__wbDestroy = function () {\n    removeOverlay();\n  };\n}"
  }
];

// ── 3. ADDON MANAGER CLASS ──────────────────────────────────────────────────
class AddonManager {
  constructor() {
    this.addons = [];
    this.isInitialized = false;
    this.compileAddonTemplate = compileAddonTemplate;
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
        if (Array.isArray(data)) {
          serverAddons = data;
        } else if (data && data.success && Array.isArray(data.addons)) {
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

    // SMART MERGE: If both server and local cache exist, preserve any user-created custom addons!
    if (serverAddons && Array.isArray(serverAddons) && localAddons && Array.isArray(localAddons)) {
      const serverMap = new Map(serverAddons.map(a => [a.id, a]));
      let hasCustom = false;
      localAddons.forEach(loc => {
        if (loc && loc.id && !serverMap.has(loc.id)) {
          serverAddons.push(loc);
          hasCustom = true;
        }
      });
      if (hasCustom) {
        this.addons = serverAddons;
        this.save(true); // Automatically sync recovered user addons back to server!
      }
    }

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

    const baseDef = addon.baseWidgetType ? WIDGET_REGISTRY[addon.baseWidgetType] : null;
    const baseSchema = (addon.schema && (addon.schema.content?.length || addon.schema.style?.length))
      ? addon.schema
      : (baseDef?.schema || { content: [], style: [] });

    const widgetDef = {
      name: addon.name || 'Custom Add-On',
      category: addon.category || (addon.baseWidgetType ? 'components' : 'addons'),
      icon: addon.icon || baseDef?.icon || '🧩',
      description: addon.description || 'Custom installed widget',
      isAddon: true,
      addonId: addon.id,
      baseWidgetType: addon.baseWidgetType || null,
      version: addon.version || '1.0.0',
      author: addon.author || 'Custom',
      defaultProps: JSON.parse(JSON.stringify(addon.defaultProps || baseDef?.defaultProps || {})),
      schema: JSON.parse(JSON.stringify(baseSchema)),
      customJs: addon.customJs || '',
      render: function(props, options = {}) {
        if (addon.baseWidgetType && WIDGET_REGISTRY[addon.baseWidgetType] && typeof WIDGET_REGISTRY[addon.baseWidgetType].render === 'function') {
          return WIDGET_REGISTRY[addon.baseWidgetType].render(props, options);
        }
        return compileAddonTemplate(addon.template, props);
      },
      // Called by the canvas after the widget HTML is injected into the DOM
      mount: function(el, props) {
        if (addon.baseWidgetType && WIDGET_REGISTRY[addon.baseWidgetType] && typeof WIDGET_REGISTRY[addon.baseWidgetType].mount === 'function') {
          try { WIDGET_REGISTRY[addon.baseWidgetType].mount(el, props); } catch(e){}
        }
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
          headers: { 'Content-Type': 'application/json',
          'X-Admin-Token': _getAdminToken(), },
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
    if ((!addonData.template || !addonData.template.trim()) && !addonData.baseWidgetType) {
      throw new Error('Invalid add-on package: "template" HTML is required.');
    }
    if (!addonData.template) {
      addonData.template = '<div class="custom-block"></div>';
    }

    let id = addonData.id;
    if (!id) {
      id = 'addon_' + addonData.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    }
    addonData.id = id;
    addonData.category = addonData.category || (addonData.baseWidgetType ? 'components' : 'addons');
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
        <div class="maker-tabs-bar" style="display:flex;gap:4px;padding:8px 20px;background:rgba(0,0,0,0.25);border-bottom:1px solid var(--border-subtle);overflow-x:auto;">
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
            <div class="maker-meta-header" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
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
                <textarea id="maker-desc" rows="2" placeholder="Brief summary of what this widget does..."></textarea>
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
            <textarea id="maker-template" rows="12" style="font-family:'JetBrains Mono',monospace;font-size:0.82rem;width:100%;resize:vertical;line-height:1.45;"></textarea>
          </div>

          <!-- TAB 4: SCOPED CSS -->
          <div id="maker-tab-css" class="maker-tab-pane" style="display:none;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
              <div>
                <div style="font-weight:700;font-size:0.95rem;color:#fff;">Custom Scoped CSS</div>
                <div style="font-size:0.78rem;color:#cbd5e1;margin-top:2px;">Write clean CSS for your widget. It will be loaded on the canvas and in the live site.</div>
              </div>
            </div>
            <textarea id="maker-css" rows="14" style="font-family:'JetBrains Mono',monospace;font-size:0.82rem;width:100%;resize:vertical;line-height:1.45;"></textarea>
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
            <textarea id="maker-js" rows="14" style="font-family:'JetBrains Mono',monospace;font-size:0.82rem;width:100%;resize:vertical;line-height:1.45;" placeholder="// Write your onMount(el, props) function here...&#10;function onMount(el, props) {&#10;  // e.g. attach a click counter&#10;  var btn = el.querySelector('.my-btn');&#10;  if (btn) btn.addEventListener('click', function() {&#10;    alert('Clicked!');&#10;  });&#10;}"></textarea>
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
            <button type="button" class="btn btn-sm btn-success" id="btn-maker-save" style="font-weight:700;font-size:0.84rem;padding:9px 16px;color:#ffffff !important;background:linear-gradient(135deg,#10b981,#059669);border:1px solid rgba(255,255,255,0.25);box-shadow:0 4px 16px rgba(16,185,129,0.45);border-radius:8px;cursor:pointer;">
              <span style="color:#ffffff !important;">🚀 Save &amp; Install</span>
            </button>
            <button type="button" class="btn btn-sm" id="btn-maker-publish-store" style="font-weight:700;font-size:0.84rem;padding:9px 16px;color:#ffffff !important;background:linear-gradient(135deg,#6366f1,#4f46e5);border:1px solid rgba(255,255,255,0.25);box-shadow:0 4px 16px rgba(99,102,241,0.35);border-radius:8px;cursor:pointer;" title="Save locally and publish directly to the Add-on Store feed">
              <span style="color:#ffffff !important;">🌐 Save &amp; Publish to Store</span>
            </button>
          </div>
        </div>
      </div>
    `;

    // ── Safely populate textareas AFTER innerHTML (avoids backtick injection) ──
    const _safeSet = (id, val) => { const el = modal.querySelector('#' + id); if (el) el.value = val || ''; };
    _safeSet('maker-desc',     currentData.description || '');
    _safeSet('maker-template', currentData.template    || '');
    _safeSet('maker-css',      currentData.customCss   || '');
    _safeSet('maker-js',       currentData.customJs    || '');

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

    // ── Sub-field editor (recursive) ──────────────────────────────────────
    // Renders a visual sub-field list for repeater type props at any depth.
    // depth=0 → top-level repeater fields, depth=1 → nested (submenu) fields
    const SUB_FIELD_TYPES = [
      { value: 'text',         label: 'Text' },
      { value: 'textarea',     label: 'Textarea' },
      { value: 'number',       label: 'Number' },
      { value: 'color',        label: 'Color' },
      { value: 'toggle',       label: 'Toggle' },
      { value: 'image-picker', label: 'Image' },
      { value: 'page-link',    label: 'Link (Page Selector)' },
      { value: 'repeater',     label: 'Repeater (Nested List)' },
    ];

    const buildSubFieldTypeOptions = (selectedType) =>
      SUB_FIELD_TYPES.map(t =>
        `<option value="${t.value}" ${selectedType === t.value ? 'selected' : ''}>${t.label}</option>`
      ).join('');

    const renderSubFieldEditor = (fieldsArray, container, depth = 0) => {
      container.innerHTML = '';
      const indent = depth > 0 ? 'border-left:2px solid rgba(139,92,246,0.35);padding-left:12px;' : '';
      const bgColor = depth === 0
        ? 'rgba(99,102,241,0.07)'
        : 'rgba(139,92,246,0.05)';
      const accentColor = depth === 0 ? '#a5b4fc' : '#c4b5fd';
      const headerLabel = depth === 0 ? '↳ Sub-fields (Repeater Items)' : '↳↳ Nested Sub-fields';

      // Header bar
      const header = document.createElement('div');
      header.style.cssText = `display:flex;align-items:center;justify-content:space-between;padding:6px 10px;background:${bgColor};border-radius:6px 6px 0 0;border:1px solid rgba(99,102,241,0.2);border-bottom:none;${indent}`;
      header.innerHTML = `
        <span style="font-size:0.72rem;font-weight:700;color:${accentColor};letter-spacing:0.04em;">${headerLabel}</span>
        <button type="button" class="btn-add-subfield" style="font-size:0.7rem;font-weight:700;padding:3px 10px;border-radius:5px;background:rgba(99,102,241,0.25);color:${accentColor};border:1px solid rgba(99,102,241,0.35);cursor:pointer;">+ Add Sub-field</button>
      `;
      container.appendChild(header);

      // Sub-field rows wrapper
      const rowsWrap = document.createElement('div');
      rowsWrap.style.cssText = `background:${bgColor};border:1px solid rgba(99,102,241,0.2);border-top:none;border-radius:0 0 6px 6px;padding:8px;display:flex;flex-direction:column;gap:6px;`;

      const renderSubRows = () => {
        rowsWrap.innerHTML = '';
        if (fieldsArray.length === 0) {
          const empty = document.createElement('div');
          empty.style.cssText = 'font-size:0.72rem;color:var(--text-dim);text-align:center;padding:8px;font-style:italic;';
          empty.textContent = 'No sub-fields yet. Click "+ Add Sub-field" to define what each list item contains.';
          rowsWrap.appendChild(empty);
          return;
        }
        fieldsArray.forEach((sf, si) => {
          const sfRow = document.createElement('div');
          sfRow.className = 'maker-subfield-row';
          sfRow.style.cssText = 'display:grid;grid-template-columns:1.2fr 1.2fr 1.2fr 28px;gap:6px;align-items:start;padding:6px 8px;background:rgba(255,255,255,0.03);border:1px solid rgba(99,102,241,0.15);border-radius:6px;';
          sfRow.innerHTML = `
            <div>
              <span style="font-size:0.68rem;font-weight:700;color:#94a3b8;display:block;margin-bottom:2px;">Key</span>
              <input type="text" class="sf-key" value="${sf.key || ''}" placeholder="key" style="font-size:0.73rem;padding:3px 5px;font-family:monospace;width:100%;box-sizing:border-box;" />
            </div>
            <div>
              <span style="font-size:0.68rem;font-weight:700;color:#94a3b8;display:block;margin-bottom:2px;">Label</span>
              <input type="text" class="sf-label" value="${sf.label || ''}" placeholder="Label" style="font-size:0.73rem;padding:3px 5px;width:100%;box-sizing:border-box;" />
            </div>
            <div>
              <span style="font-size:0.68rem;font-weight:700;color:#94a3b8;display:block;margin-bottom:2px;">Type</span>
              <select class="sf-type" style="font-size:0.73rem;padding:3px 5px;width:100%;box-sizing:border-box;">
                ${buildSubFieldTypeOptions(sf.type || 'text')}
              </select>
            </div>
            <div style="display:flex;align-items:flex-end;padding-bottom:2px;">
              <button type="button" class="sf-del" style="color:#f87171;font-size:0.8rem;padding:3px;cursor:pointer;background:none;border:none;" title="Remove">🗑️</button>
            </div>
          `;

          // Nested sub-field container (shown when type = repeater)
          const nestedContainer = document.createElement('div');
          nestedContainer.style.cssText = 'grid-column:1/-1;margin-top:4px;display:' + (sf.type === 'repeater' ? 'block' : 'none') + ';';
          if (!Array.isArray(sf.fields)) sf.fields = [];
          if (sf.type === 'repeater' && depth < 1) {
            renderSubFieldEditor(sf.fields, nestedContainer, depth + 1);
          }
          sfRow.appendChild(nestedContainer);

          // Listeners
          sfRow.querySelector('.sf-key').addEventListener('input', (e) => { sf.key = e.target.value; });
          sfRow.querySelector('.sf-label').addEventListener('input', (e) => { sf.label = e.target.value; });
          sfRow.querySelector('.sf-type').addEventListener('change', (e) => {
            sf.type = e.target.value;
            if (sf.type === 'repeater' && depth < 1) {
              if (!Array.isArray(sf.fields)) sf.fields = [];
              nestedContainer.style.display = 'block';
              renderSubFieldEditor(sf.fields, nestedContainer, depth + 1);
            } else {
              nestedContainer.style.display = 'none';
            }
          });
          sfRow.querySelector('.sf-del').addEventListener('click', () => {
            fieldsArray.splice(si, 1);
            renderSubRows();
          });

          rowsWrap.appendChild(sfRow);
        });
      };

      renderSubRows();
      container.appendChild(rowsWrap);

      // Add sub-field button
      header.querySelector('.btn-add-subfield').addEventListener('click', () => {
        fieldsArray.push({ key: 'field_' + (fieldsArray.length + 1), label: 'Field ' + (fieldsArray.length + 1), type: 'text' });
        renderSubRows();
      });
    };
    // ── End sub-field editor ───────────────────────────────────────────────

    const renderPropsRows = () => {
      propsListEl.innerHTML = '';
      propsState.forEach((prop, idx) => {
        // Outer wrapper so sub-field panel sits below the main row
        const wrapper = document.createElement('div');
        wrapper.style.cssText = 'display:flex;flex-direction:column;gap:0;';

        const row = document.createElement('div');
        row.className = 'maker-prop-row';
        row.style.cssText = 'display:grid;grid-template-columns:1.5fr 1.5fr 1fr 1fr 1.5fr 36px;gap:8px;align-items:center;padding:8px 10px;background:rgba(255,255,255,0.03);border:1px solid var(--border-subtle);border-radius:' + (prop.type === 'repeater' ? '8px 8px 0 0' : '8px') + ';';
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
              <option value="repeater" ${prop.type === 'repeater' ? 'selected' : ''}>Repeater (List)</option>
              <option value="form-builder" ${prop.type === 'form-builder' ? 'selected' : ''}>Form Fields Builder</option>
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
            <input type="text" class="prop-val-input" value="${prop.defVal ?? ''}" style="font-size:0.75rem;padding:4px 6px;" placeholder="${prop.type === 'repeater' ? 'n/a — use sub-fields' : 'default'}" ${prop.type === 'repeater' ? 'disabled' : ''} />
          </div>
          <div>
            <span style="font-size:0.74rem;color:transparent;display:block;margin-bottom:4px;">x</span>
            <button type="button" class="tool-icon-btn btn-del-prop" style="color:#f87171;padding:4px;" title="Remove Prop">🗑️</button>
          </div>
        `;

        // Sub-field panel (shown only when type = repeater)
        const subFieldPanel = document.createElement('div');
        subFieldPanel.style.cssText = 'display:' + (prop.type === 'repeater' ? 'block' : 'none') + ';margin-bottom:4px;';
        if (!Array.isArray(prop.fields)) prop.fields = [];
        if (prop.type === 'repeater') {
          renderSubFieldEditor(prop.fields, subFieldPanel, 0);
        }

        // Listeners
        row.querySelector('.prop-key-input').addEventListener('input', (e) => { prop.key = e.target.value; renderTokenPills(); });
        row.querySelector('.prop-label-input').addEventListener('input', (e) => { prop.label = e.target.value; });
        row.querySelector('.prop-type-select').addEventListener('change', (e) => {
          prop.type = e.target.value;
          const isRepeater = prop.type === 'repeater';
          row.style.borderRadius = isRepeater ? '8px 8px 0 0' : '8px';
          const valInput = row.querySelector('.prop-val-input');
          valInput.disabled = isRepeater;
          valInput.placeholder = isRepeater ? 'n/a — use sub-fields' : 'default';
          if (isRepeater) {
            if (!Array.isArray(prop.fields)) prop.fields = [];
            subFieldPanel.style.display = 'block';
            renderSubFieldEditor(prop.fields, subFieldPanel, 0);
          } else {
            subFieldPanel.style.display = 'none';
          }
        });
        row.querySelector('.prop-sec-select').addEventListener('change', (e) => { prop.section = e.target.value; });
        row.querySelector('.prop-val-input').addEventListener('input', (e) => { prop.defVal = e.target.value; });
        row.querySelector('.btn-del-prop').addEventListener('click', () => {
          propsState.splice(idx, 1);
          renderPropsRows();
          renderTokenPills();
        });

        wrapper.appendChild(row);
        wrapper.appendChild(subFieldPanel);
        propsListEl.appendChild(wrapper);
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
        let defValue = p.defVal;
        if (p.type === 'number') {
          defValue = parseFloat(p.defVal) || 0;
        } else if (p.type === 'toggle') {
          defValue = (p.defVal === 'true' || p.defVal === true);
        } else if (p.type === 'repeater') {
          if (typeof p.defVal === 'string' && p.defVal.trim()) {
            try {
              defValue = JSON.parse(p.defVal);
            } catch (_) {
              defValue = [];
            }
          } else if (Array.isArray(p.defVal)) {
            defValue = p.defVal;
          } else {
            defValue = [];
          }
        }
        defaultProps[p.key] = defValue;

        const fieldItem = { key: p.key, label: p.label || p.key, type: p.type || 'text' };
        if (p.type === 'repeater') {
          if (p.fields && Array.isArray(p.fields) && p.fields.length > 0) {
            fieldItem.fields = p.fields;
          } else if (Array.isArray(defValue) && defValue.length > 0 && typeof defValue[0] === 'object' && defValue[0] !== null) {
            fieldItem.fields = Object.keys(defValue[0]).map(k => {
              const val = defValue[0][k];
              let fType = 'text';
              if (typeof val === 'boolean') fType = 'toggle';
              else if (typeof val === 'number') fType = 'number';
              else if (Array.isArray(val) || k === 'children' || k === 'subItems') {
                fType = 'repeater';
                const subSample = (Array.isArray(val) && val[0]) ? val[0] : {};
                const subKeys = Object.keys(subSample);
                const subFields = subKeys.length ? subKeys.map(sk => ({
                  key: sk,
                  label: sk.charAt(0).toUpperCase() + sk.slice(1),
                  type: (sk === 'link' || sk === 'url') ? 'page-link' : 'text'
                })) : [
                  { key: 'label', label: 'Label', type: 'text' },
                  { key: 'link', label: 'Link', type: 'page-link' }
                ];
                return { key: k, label: k.charAt(0).toUpperCase() + k.slice(1), type: 'repeater', fields: subFields };
              } else if (k === 'link' || k === 'url' || k === 'page') fType = 'page-link';
              else if (k.toLowerCase().includes('image') || k.toLowerCase().includes('photo')) fType = 'image-picker';
              return { key: k, label: k.charAt(0).toUpperCase() + k.slice(1), type: fType };
            });
          } else {
            fieldItem.fields = [
              { key: 'label', label: 'Label', type: 'text' },
              { key: 'link', label: 'Link', type: 'page-link' },
              {
                key: 'children',
                label: 'Submenu (Children)',
                type: 'repeater',
                fields: [
                  { key: 'label', label: 'Submenu Label', type: 'text' },
                  { key: 'link', label: 'Submenu Link', type: 'page-link' }
                ]
              }
            ];
          }
        }

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

    modal.querySelector('#btn-maker-publish-store')?.addEventListener('click', async () => {
      const pkg = saveAddonPackage();
      if (!pkg) return;
      const pubBtn = modal.querySelector('#btn-maker-publish-store');
      pubBtn.disabled = true;
      pubBtn.innerHTML = '<span>⏳</span> Publishing to Store...';
      try {
        const storedPat = (typeof window.devAuth !== 'undefined' ? window.devAuth.getStoredPat() : null) || localStorage.getItem('aether_dev_github_pat') || '';
        let userPat = storedPat;
        if (!userPat) {
          userPat = prompt('Enter your GitHub Personal Access Token (PAT) with "repo" scope to publish to Store:');
          if (userPat && userPat.trim()) {
            userPat = userPat.trim();
            localStorage.setItem('aether_dev_github_pat', userPat);
          }
        }
        if (userPat && typeof window.devAuth !== 'undefined') {
          const apiBase = (typeof window._aetherApiBase !== 'undefined') ? window._aetherApiBase : 'api.php';
          const r = await fetch(`${apiBase}?action=get_addons&_t=${Date.now()}`);
          const curAddons = await r.json();
          if (Array.isArray(curAddons)) {
            await window.devAuth.pushFileToGitHub(
              'data/addons.json',
              JSON.stringify(curAddons, null, 2),
              `Marketplace feed: publish ${pkg.name} [v${pkg.version}] via Add-on Studio`,
              userPat
            );
          }
          if (typeof window.addonStore !== 'undefined') {
            await window.addonStore.syncRemoteFeed();
          }
          if (window.aetherApp?.canvas?.showToast) {
            window.aetherApp.canvas.showToast(`🎉 "${pkg.name}" published to Add-On Store!`, 'success');
          }
        } else {
          if (window.aetherApp?.canvas?.showToast) {
            window.aetherApp.canvas.showToast('Saved locally. Enter GitHub PAT in Developer Tab to publish to remote feed.', 'info');
          }
        }
        modal.remove();
        if (typeof onSaved === 'function') onSaved(pkg);
      } catch (err) {
        alert('Could not publish to GitHub: ' + err.message + '\n\nAdd-on was saved locally.');
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
