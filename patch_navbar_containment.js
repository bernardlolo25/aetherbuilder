/**
 * patch_navbar_containment.js
 * ===========================
 * Nuclear fix: Prevent built-in Navbar widget from escaping canvas in editor.
 *
 * Approach:
 *  1. widgets.css  — Append a high-specificity editor-only block at the VERY END
 *                    of the file so it ALWAYS wins the cascade over the fixed rule.
 *                    In editor: position:relative. In public mode: position:fixed (unchanged).
 *
 *  2. builder.js   — In `initFloatingNav()`, when NOT in public mode, force
 *                    position:relative on the navbar element inline so even JS
 *                    can't accidentally re-apply position:fixed.
 *
 *  3. builder.css  — Harden the .builder-canvas-viewport rule.
 */

const fs = require('fs');
const BASE = 'C:\\Users\\U S E R - P C\\.gemini\\antigravity-ide\\scratch\\elementor-builder';
const widgetsCss  = `${BASE}\\css\\widgets.css`;
const builderCss  = `${BASE}\\css\\builder.css`;
const builderJs   = `${BASE}\\js\\builder.js`;

// ─── 1. widgets.css — nuclear editor override ───────────────────────────────
{
  const append = `

/* ==========================================================================
   EDITOR-ONLY NAVBAR CONTAINMENT  (appended — wins cascade over rules above)
   Selector specificity: 0-3-0  vs base rule 0-2-0 → always overrides.
   In public mode these selectors never match (no .builder-canvas-viewport).
   ========================================================================== */
.builder-canvas-viewport .wb-navbar,
.builder-canvas-viewport .wb-navbar.is-floating,
.builder-canvas-viewport .wb-navbar.is-sticky {
  position: relative !important;  /* stay inside canvas — NEVER fixed/absolute */
  top: auto !important;
  left: auto !important;
  right: auto !important;
  bottom: auto !important;
  transform: none !important;
  width: 100% !important;
  max-width: 100% !important;
  margin: 0 !important;
  z-index: 1 !important;
}
`;
  let css = fs.readFileSync(widgetsCss, 'utf8');
  // Only append once
  if (css.includes('EDITOR-ONLY NAVBAR CONTAINMENT')) {
    console.log('  ⚠ widgets.css already has editor-only block — skipping append');
  } else {
    fs.writeFileSync(widgetsCss, css + append, 'utf8');
    console.log('  ✓ widgets.css — appended editor-only navbar containment override');
  }
}

// ─── 2. builder.css — harden canvas viewport (already has transform, just verify) ──
{
  let css = fs.readFileSync(builderCss, 'utf8');
  if (css.includes('transform: translateZ(0)')) {
    console.log('  ✓ builder.css — transform:translateZ(0) already present on canvas viewport');
  } else {
    css = css.replace(
      '  z-index: 10 !important;\n  isolation: isolate !important;',
      '  z-index: 10;\n  transform: translateZ(0); /* Containing block for fixed children */'
    );
    fs.writeFileSync(builderCss, css, 'utf8');
    console.log('  ✓ builder.css — replaced isolation:isolate with transform:translateZ(0)');
  }

  // Also ensure .builder-canvas-viewport has overflow-x:hidden (prevents horizontal bleed)
  // and that the existing bottom override uses .builder-body prefix (already patched)
  if (css.includes('.builder-body .builder-canvas-viewport .wb-navbar.is-floating')) {
    console.log('  ✓ builder.css — .builder-body prefix override already present');
  } else {
    console.log('  ⚠ builder.css — .builder-body prefix override missing, please re-run patch_final_fixes.js');
  }
}

// ─── 3. builder.js — strip position:fixed in editor after widget renders ────
{
  let js = fs.readFileSync(builderJs, 'utf8');

  const OLD_INIT = `  // Floating Navbar Scroll Feedback
  initFloatingNav(container) {
    const navbar = container.querySelector('.wb-navbar.is-floating, .wb-navbar.is-sticky');
    if (!navbar) return;

    const scrollTarget = this.isPublicMode ? window : this.viewport;`;

  const NEW_INIT = `  // Floating Navbar Scroll Feedback
  initFloatingNav(container) {
    const navbar = container.querySelector('.wb-navbar.is-floating, .wb-navbar.is-sticky');
    if (!navbar) return;

    // ── EDITOR SAFETY: force the navbar back into normal flow so it never
    //    escapes the canvas preview into the admin UI chrome. ──────────────
    if (!this.isPublicMode) {
      navbar.style.setProperty('position', 'relative', 'important');
      navbar.style.setProperty('top',      'auto',     'important');
      navbar.style.setProperty('left',     'auto',     'important');
      navbar.style.setProperty('transform','none',     'important');
      navbar.style.setProperty('width',    '100%',     'important');
      navbar.style.setProperty('z-index',  '1',        'important');
    }

    const scrollTarget = this.isPublicMode ? window : this.viewport;`;

  if (js.includes('EDITOR SAFETY: force the navbar back')) {
    console.log('  ⚠ builder.js — editor safety block already present — skipping');
  } else if (!js.includes(OLD_INIT)) {
    console.error('  ✗ builder.js — could not find initFloatingNav target string (may have changed)');
  } else {
    js = js.split(OLD_INIT).join(NEW_INIT);
    fs.writeFileSync(builderJs, js, 'utf8');
    console.log('  ✓ builder.js — added editor-safety inline style reset in initFloatingNav()');
  }
}

console.log('\nAll patches done.');

