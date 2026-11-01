const fs = require('fs');
const path = require('path');

const baseDir = 'C:\\Users\\U S E R - P C\\.gemini\\antigravity-ide\\scratch\\elementor-builder';

// ============================================================================
// 1. UPDATE css/design-system.css
// ============================================================================
const dsPath = path.join(baseDir, 'css', 'design-system.css');
let dsCode = fs.readFileSync(dsPath, 'utf8');

const oldZIndex = `  --z-canvas: 10;
  --z-panel: 50;
  --z-topbar: 100;
  --z-modal: 1000;
  --z-toast: 2000;`;

const newZIndex = `  --z-canvas: 10;
  --z-panel: 8000;
  --z-topbar: 9000;
  --z-modal: 100000;
  --z-toast: 200000;`;

if (dsCode.includes(oldZIndex)) {
  dsCode = dsCode.replace(oldZIndex, newZIndex);
  fs.writeFileSync(dsPath, dsCode, 'utf8');
  console.log('design-system.css: Upgraded z-index constants.');
} else {
  console.log('design-system.css: z-index constants already upgraded or not matched.');
}

// ============================================================================
// 2. UPDATE js/builder.js
// ============================================================================
const builderJsPath = path.join(baseDir, 'js', 'builder.js');
let builderJsCode = fs.readFileSync(builderJsPath, 'utf8');

const oldStickyJs = `      if (isStickySec) {
        secWrapper.classList.add('is-sticky-section');
        secWrapper.style.setProperty('position', 'sticky', 'important');
        secWrapper.style.setProperty('top', '0px', 'important');
        secWrapper.style.setProperty('z-index', '9999', 'important');
        secWrapper.style.setProperty('padding', '0px', 'important');
        secWrapper.style.setProperty('margin', '0px', 'important');
      }`;

const newStickyJs = `      if (isStickySec) {
        secWrapper.classList.add('is-sticky-section');
        secWrapper.style.setProperty('position', 'sticky', 'important');
        secWrapper.style.setProperty('top', '0px', 'important');
        secWrapper.style.setProperty('z-index', this.isPublicMode ? '9999' : '60', 'important');
        secWrapper.style.setProperty('padding', '0px', 'important');
        secWrapper.style.setProperty('margin', '0px', 'important');
      }`;

if (builderJsCode.includes(oldStickyJs)) {
  builderJsCode = builderJsCode.replace(oldStickyJs, newStickyJs);
  fs.writeFileSync(builderJsPath, builderJsCode, 'utf8');
  console.log('builder.js: Updated sticky z-index scoping for public vs editor.');
} else {
  console.log('builder.js: Old sticky pattern not found or already updated.');
}

// ============================================================================
// 3. UPDATE css/builder.css
// ============================================================================
const builderCssPath = path.join(baseDir, 'css', 'builder.css');
let builderCssCode = fs.readFileSync(builderCssPath, 'utf8');

// A. Topbar and Sidebar z-index
builderCssCode = builderCssCode.replace(
  /\.builder-topbar\s*\{[\s\S]*?z-index:\s*var\(--z-topbar\);/,
  `.builder-topbar {\n  height: var(--topbar-height);\n  background: var(--bg-panel-header);\n  border-bottom: 1px solid var(--border-subtle);\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  padding: 0 18px;\n  position: relative;\n  z-index: 9000 !important;`
);

builderCssCode = builderCssCode.replace(
  /\.builder-sidebar\s*\{[\s\S]*?z-index:\s*var\(--z-panel\);/,
  `.builder-sidebar {\n  width: var(--sidebar-width);\n  min-width: 260px;\n  max-width: 650px;\n  background: var(--bg-panel);\n  border-right: 1px solid var(--border-subtle);\n  display: flex;\n  flex-direction: column;\n  z-index: 8000 !important;`
);

// B. Canvas Viewport Containment & Boundary Padding
const oldViewport = `.builder-canvas-viewport {
  flex: 1;
  background: #060911;
  overflow-y: auto;
  overflow-x: hidden;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 32px 20px 80px;
  position: relative;
  transition: all var(--transition-normal);
}`;

const newViewport = `.builder-canvas-viewport {
  flex: 1;
  background: #060911;
  overflow-y: auto;
  overflow-x: hidden;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 36px 20px 80px;
  position: relative;
  z-index: 10 !important;
  isolation: isolate !important; /* HARD CSS BOUNDARY: Prevents any child from rendering above the topbar or sidebar */
  transition: all var(--transition-normal);
}`;

if (builderCssCode.includes(oldViewport)) {
  builderCssCode = builderCssCode.replace(oldViewport, newViewport);
  console.log('builder.css: Updated builder-canvas-viewport with isolation and z-index.');
}

// C. Mode-desktop padding for clear boundary above first section
const oldDesktopMode = `.builder-canvas-viewport.mode-desktop {
  padding: 0 0 80px 0;
  align-items: stretch;
}`;

const newDesktopMode = `.builder-canvas-viewport.mode-desktop {
  padding: 36px 0 100px 0 !important;
  align-items: stretch;
}`;

if (builderCssCode.includes(oldDesktopMode)) {
  builderCssCode = builderCssCode.replace(oldDesktopMode, newDesktopMode);
  console.log('builder.css: Updated mode-desktop padding for clean top boundary.');
}

// D. Sticky section z-index and handle bar
const oldStickySecCss = `.canvas-section-wrapper.is-sticky-section {
  position: -webkit-sticky !important;
  position: sticky !important;
  top: 0 !important;
  z-index: 9999 !important;
}`;

const newStickySecCss = `.canvas-section-wrapper.is-sticky-section {
  position: -webkit-sticky !important;
  position: sticky !important;
  top: 0 !important;
  z-index: 60 !important;
}`;

if (builderCssCode.includes(oldStickySecCss)) {
  builderCssCode = builderCssCode.replace(oldStickySecCss, newStickySecCss);
  console.log('builder.css: Scoped is-sticky-section z-index.');
}

// E. Add canvas containment rules and floating navbar fixes at bottom of builder.css
const canvasContainmentRules = `
/* ==========================================================================
   CANVAS STACKING CONTEXT & FLOATING NAVBAR CONTAINMENT
   ========================================================================== */
/* Confine floating navbars inside editor canvas so they never escape into window */
.builder-canvas-viewport .wb-navbar.is-floating {
  position: sticky !important;
  top: 10px !important;
  left: auto !important;
  transform: none !important;
  width: calc(100% - 32px) !important;
  margin: 6px auto 14px auto !important;
  max-width: 1240px !important;
  z-index: 60 !important;
}

.builder-canvas-viewport .wb-navbar.style-institutional.is-floating,
.builder-canvas-viewport .wb-navbar.style-twotier.is-floating,
.builder-canvas-viewport .wb-navbar.style-fullwidth.is-floating {
  position: sticky !important;
  top: 0 !important;
  left: auto !important;
  transform: none !important;
  width: 100% !important;
  margin: 0 !important;
  z-index: 60 !important;
}

/* Elevate hovered/active section above neighboring sections */
.canvas-section-wrapper:hover,
.canvas-section-wrapper.builder-element-active {
  z-index: 80 !important;
}

/* Floating Section Controls Handle (Drag, Up, Down, Add, Duplicate, Delete) */
.section-handle-bar {
  position: absolute;
  top: 0;
  left: 50%;
  transform: translate(-50%, -50%);
  background: var(--primary);
  color: #fff;
  border-radius: var(--radius-full);
  display: flex;
  align-items: center;
  padding: 3px 10px;
  gap: 6px;
  z-index: 200 !important; /* ALWAYS stays above section content & sticky navbars */
  opacity: 0;
  transition: opacity var(--transition-fast), transform var(--transition-fast);
  box-shadow: 0 4px 14px rgba(99, 102, 241, 0.5);
  pointer-events: none;
}

.canvas-section-wrapper:hover .section-handle-bar,
.canvas-section-wrapper.builder-element-active .section-handle-bar,
.wb-section:hover .section-handle-bar {
  opacity: 1 !important;
  pointer-events: auto !important;
}

/* First section handle bar sits safely within top boundary without getting cut off */
.canvas-section-wrapper:first-child .section-handle-bar {
  top: 2px;
}

.canvas-section-wrapper.is-sticky-section .section-handle-bar {
  top: 14px;
  transform: translate(-50%, 0);
  z-index: 250 !important;
}
`;

if (!builderCssCode.includes('CANVAS STACKING CONTEXT & FLOATING NAVBAR CONTAINMENT')) {
  builderCssCode += '\n' + canvasContainmentRules;
  console.log('builder.css: Appended canvas containment rules.');
}

fs.writeFileSync(builderCssPath, builderCssCode, 'utf8');
console.log('builder.css saved successfully!');

