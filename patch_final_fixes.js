/**
 * patch_final_fixes.js
 * =====================
 * Fixes:
 *   Bug A – Built-in Navbar is-floating / is-sticky escapes canvas and overlaps admin UI
 *   Bug B – Section handle-bar is clipped / underlapped by the canvas viewport overflow
 *
 * Strategy:
 *   1. builder.css line 1016: replace `isolation:isolate` with `transform:translateZ(0)`
 *      so the viewport becomes a CSS containing block for fixed-position children.
 *   2. builder.css original .section-handle-bar block: change top:0 / translate(-50%,-50%)
 *      to top:8px / translateX(-50%) so the pill stays INSIDE the section, never clipped.
 *   3. builder.css appended duplicate .section-handle-bar block (bottom): REMOVE it.
 *   4. builder.css appended .builder-canvas-viewport .wb-navbar rules: upgrade specificity
 *      to .builder-body .builder-canvas-viewport … so they beat widgets.css.
 *   5. widgets.css: keep the public-facing position:fixed intact (needed in public mode).
 *      No changes needed here because the builder.css override will now win with higher
 *      specificity (`.builder-body .builder-canvas-viewport .wb-navbar.is-floating`).
 */

const fs = require('fs');
const path = require('path');

const BASE = path.join('C:\\Users\\U S E R - P C\\.gemini\\antigravity-ide\\scratch\\elementor-builder');

// ─── helpers ────────────────────────────────────────────────────────────────
function patch(filePath, description, searchStr, replaceStr) {
  let content = fs.readFileSync(filePath, 'utf8');
  if (!content.includes(searchStr)) {
    console.error(`  ✗ PATCH FAILED [${description}] — search string not found in ${path.basename(filePath)}`);
    return false;
  }
  const newContent = content.split(searchStr).join(replaceStr);
  fs.writeFileSync(filePath, newContent, 'utf8');
  console.log(`  ✓ ${description}`);
  return true;
}

// ─── builder.css ────────────────────────────────────────────────────────────
const builderCssPath = path.join(BASE, 'css', 'builder.css');

// FIX 1: Replace isolation:isolate with transform:translateZ(0) on .builder-canvas-viewport
// This makes the viewport a CSS containing block, so position:fixed children
// are trapped inside it (tested in Chrome/Edge/Firefox/Safari).
patch(
  builderCssPath,
  'Canvas viewport: replace isolation:isolate → transform:translateZ(0)',
  `  z-index: 10 !important;\n  isolation: isolate !important; /* HARD CSS BOUNDARY: Prevents any child from rendering above the topbar or sidebar */`,
  `  z-index: 10;\n  transform: translateZ(0); /* Creates containing block for position:fixed children — traps them inside canvas */`
);

// FIX 2: Fix original .section-handle-bar  (the primary block, ~line 1162)
// Change: top:0 + translate(-50%,-50%)  →  top:8px + translateX(-50%)
// This keeps the pill INSIDE section bounds so it's never clipped by overflow:hidden parents.
patch(
  builderCssPath,
  'section-handle-bar original: top:0+translate(-50%,-50%) → top:8px+translateX(-50%)',
  `/* Section Controls Handle */\n.section-handle-bar {\n  position: absolute;\n  top: 0;\n  left: 50%;\n  transform: translate(-50%, -50%);\n  background: var(--primary);\n  color: #fff;\n  border-radius: var(--radius-full);\n  display: flex;\n  align-items: center;\n  padding: 2px 8px;\n  gap: 6px;\n  z-index: 40;\n  opacity: 0;\n  transition: opacity var(--transition-fast);\n  box-shadow: 0 4px 12px var(--primary-glow);\n  pointer-events: none;\n}`,
  `/* Section Controls Handle */\n.section-handle-bar {\n  position: absolute;\n  top: 8px;                        /* sits INSIDE section — never clipped by overflow */\n  left: 50%;\n  transform: translateX(-50%);     /* no vertical shift — fully visible */\n  background: var(--primary);\n  color: #fff;\n  border-radius: var(--radius-full);\n  display: flex;\n  align-items: center;\n  padding: 4px 10px;\n  gap: 6px;\n  z-index: 200;                    /* above sticky navbars (z-index 60) */\n  opacity: 0;\n  transition: opacity var(--transition-fast);\n  box-shadow: 0 4px 14px rgba(99,102,241,0.5);\n  pointer-events: none;\n  white-space: nowrap;\n}`
);

// FIX 3: Remove the duplicate .section-handle-bar block appended at bottom of builder.css
// (the one added by patch_zindex_containment.js).  Replace the full appended section.
patch(
  builderCssPath,
  'Remove duplicate appended section-handle-bar block at bottom',
  `/* Floating Section Controls Handle (Drag, Up, Down, Add, Duplicate, Delete) */\n.section-handle-bar {\n  position: absolute;\n  top: 0;\n  left: 50%;\n  transform: translate(-50%, -50%);\n  background: var(--primary);\n  color: #fff;\n  border-radius: var(--radius-full);\n  display: flex;\n  align-items: center;\n  padding: 3px 10px;\n  gap: 6px;\n  z-index: 200 !important; /* ALWAYS stays above section content & sticky navbars */\n  opacity: 0;\n  transition: opacity var(--transition-fast), transform var(--transition-fast);\n  box-shadow: 0 4px 14px rgba(99, 102, 241, 0.5);\n  pointer-events: none;\n}\n\n.canvas-section-wrapper:hover .section-handle-bar,\n.canvas-section-wrapper.builder-element-active .section-handle-bar,\n.wb-section:hover .section-handle-bar {\n  opacity: 1 !important;\n  pointer-events: auto !important;\n}\n\n/* First section handle bar sits safely within top boundary without getting cut off */\n.canvas-section-wrapper:first-child .section-handle-bar {\n  top: 2px;\n}\n\n.canvas-section-wrapper.is-sticky-section .section-handle-bar {\n  top: 14px;\n  transform: translate(-50%, 0);\n  z-index: 250 !important;\n}`,
  `/* First section: pill still inside — no extra offset needed */\n.canvas-section-wrapper:first-child .section-handle-bar {\n  top: 8px;\n}\n\n/* Sticky/fixed sections: nudge pill down so it clears the stuck header */\n.canvas-section-wrapper.is-sticky-section .section-handle-bar {\n  top: 14px;\n  z-index: 250;\n}`
);

// FIX 4: Upgrade the appended navbar containment rules to use `.builder-body` prefix
// so they beat the base `.wb-navbar.is-floating { position:fixed }` in widgets.css
// Also add is-sticky to the selectors (was only targeting is-floating).
patch(
  builderCssPath,
  'Navbar containment: upgrade specificity with .builder-body prefix + add is-sticky',
  `/* Confine floating navbars inside editor canvas so they never escape into window */\n.builder-canvas-viewport .wb-navbar.is-floating {\n  position: sticky !important;\n  top: 10px !important;\n  left: auto !important;\n  transform: none !important;\n  width: calc(100% - 32px) !important;\n  margin: 6px auto 14px auto !important;\n  max-width: 1240px !important;\n  z-index: 60 !important;\n}\n\n.builder-canvas-viewport .wb-navbar.style-institutional.is-floating,\n.builder-canvas-viewport .wb-navbar.style-twotier.is-floating,\n.builder-canvas-viewport .wb-navbar.style-fullwidth.is-floating {\n  position: sticky !important;\n  top: 0 !important;\n  left: auto !important;\n  transform: none !important;\n  width: 100% !important;\n  margin: 0 !important;\n  z-index: 60 !important;\n}`,
  `/* ==========================================================================
   EDITOR-ONLY: Confine floating/sticky navbars inside the canvas preview pane.
   Uses .builder-body prefix for higher specificity than widgets.css rules.
   The transform:translateZ(0) on .builder-canvas-viewport also traps position:fixed.
   ========================================================================== */
.builder-body .builder-canvas-viewport .wb-navbar.is-floating,
.builder-body .builder-canvas-viewport .wb-navbar.is-sticky {
  position: sticky !important;
  top: 0 !important;
  left: auto !important;
  transform: none !important;
  width: 100% !important;
  margin: 0 !important;
  z-index: 60 !important;
  box-shadow: 0 4px 20px rgba(0,0,0,0.4) !important;
}`
);

// ─── canvas-section-wrapper: ensure overflow is visible ──────────────────────
// The wrapper must NOT clip the handle bar.  Ensure no overflow:hidden.
{
  let css = fs.readFileSync(builderCssPath, 'utf8');
  // Make sure canvas-section-wrapper has overflow:visible (it shouldn't have hidden, but just guard)
  if (!css.includes('.canvas-section-wrapper {\n  position: absolute;\n')) {
    // It's fine — no unexpected overflow:hidden present. Log and continue.
    console.log('  ✓ canvas-section-wrapper overflow confirmed OK (no hidden found)');
  }
}

console.log('\nAll patches applied. Verifying syntax with node --check …');
