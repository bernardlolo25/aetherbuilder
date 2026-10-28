/**
 * patch_state_init.js
 * Makes state.init() async so it can await a server sync BEFORE falling back
 * to the default SaaS template. This fixes the issue where migrated hosts
 * (InfinityFree / Hostinger) show the default theme in admin instead of
 * the previously published content.
 *
 * Run: node patch_state_init.js
 */
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'js', 'state.js');
let content = fs.readFileSync(filePath, 'utf8');

// ── 1. Make init() async and add server-first logic ───────────────────────────
const OLD_INIT = `  // ── Init ───────────────────────────────────────────────────────────────────
  init() {
    const savedDraft = localStorage.getItem(STORAGE_KEY_DRAFT);
    if (savedDraft) {
      try {
        const parsed = sanitizeObject(JSON.parse(savedDraft));
        // Multi-page format
        if (Array.isArray(parsed.pages) && parsed.pages.length > 0) {
          this.pages         = parsed.pages;
          this.currentPageId = parsed.currentPageId || this.pages[0].id;
          applyTheme(this.pageSettings.themePreset, this.pageSettings.fontFamily);
          return;
        }
        // Legacy single-page format — migrate
        if (Array.isArray(parsed.sections) && parsed.sections.length > 0) {
          const homePage = makeDefaultPage(makePageId(), 'index', 'Home', parsed.sections);
          if (parsed.pageSettings) homePage.pageSettings = { ...homePage.pageSettings, ...parsed.pageSettings };
          this.pages = [homePage];
          this.currentPageId = homePage.id;
          applyTheme(this.pageSettings.themePreset, this.pageSettings.fontFamily);
          return;
        }
      } catch (err) {
        console.warn('Failed to parse draft:', err);
      }
    }

    // Default: load SaaS template on home page
    const homePage = makeDefaultPage(makePageId(), 'index', 'Home');
    this.pages = [homePage];
    this.currentPageId = homePage.id;
    this.loadTemplate('saas', false);
    applyTheme(this.pageSettings.themePreset, this.pageSettings.fontFamily);
    this.syncFromServer();
  }`;

const NEW_INIT = `  // ── Init ───────────────────────────────────────────────────────────────────
  async init() {
    const savedDraft = localStorage.getItem(STORAGE_KEY_DRAFT);
    if (savedDraft) {
      try {
        const parsed = sanitizeObject(JSON.parse(savedDraft));
        // Multi-page format
        if (Array.isArray(parsed.pages) && parsed.pages.length > 0) {
          this.pages         = parsed.pages;
          this.currentPageId = parsed.currentPageId || this.pages[0].id;
          applyTheme(this.pageSettings.themePreset, this.pageSettings.fontFamily);
          return; // Has local draft – use it immediately, no server fetch needed
        }
        // Legacy single-page format — migrate
        if (Array.isArray(parsed.sections) && parsed.sections.length > 0) {
          const homePage = makeDefaultPage(makePageId(), 'index', 'Home', parsed.sections);
          if (parsed.pageSettings) homePage.pageSettings = { ...homePage.pageSettings, ...parsed.pageSettings };
          this.pages = [homePage];
          this.currentPageId = homePage.id;
          applyTheme(this.pageSettings.themePreset, this.pageSettings.fontFamily);
          return;
        }
      } catch (err) {
        console.warn('Failed to parse draft:', err);
      }
    }

    // No local draft – try server FIRST so migrated hosts load published content
    // into admin instead of showing the default SaaS template.
    try {
      const res = await fetch('api.php?action=get_site');
      if (res.ok) {
        const rawData = await res.json();
        const data = sanitizeObject(rawData);
        if (Array.isArray(data.pages) && data.pages.length > 0) {
          this.pages         = data.pages;
          this.currentPageId = data.currentPageId || this.pages[0].id;
          // Persist as local draft so subsequent loads skip the server fetch
          localStorage.setItem(STORAGE_KEY_DRAFT, JSON.stringify({
            pages: this.pages,
            currentPageId: this.currentPageId
          }));
          localStorage.setItem(STORAGE_KEY_PUBLIC, JSON.stringify(data));
          applyTheme(this.pageSettings.themePreset, this.pageSettings.fontFamily);
          return; // Loaded from server
        } else if (Array.isArray(data.sections) && data.sections.length > 0) {
          // Legacy single-page server format
          const pg = makeDefaultPage(makePageId(), 'index', 'Home', data.sections);
          if (data.pageSettings) pg.pageSettings = { ...pg.pageSettings, ...data.pageSettings };
          this.pages = [pg];
          this.currentPageId = pg.id;
          localStorage.setItem(STORAGE_KEY_DRAFT, JSON.stringify({
            pages: this.pages,
            currentPageId: this.currentPageId
          }));
          localStorage.setItem(STORAGE_KEY_PUBLIC, JSON.stringify(data));
          applyTheme(this.pageSettings.themePreset, this.pageSettings.fontFamily);
          return;
        }
      }
    } catch { /* Server unreachable – fall through to default template */ }

    // Absolute fallback: no local draft, no server data → load default SaaS template
    const homePage = makeDefaultPage(makePageId(), 'index', 'Home');
    this.pages = [homePage];
    this.currentPageId = homePage.id;
    this.loadTemplate('saas', false);
    applyTheme(this.pageSettings.themePreset, this.pageSettings.fontFamily);
  }`;

if (!content.includes('init() {')) {
  console.error('Could not find init() method in state.js');
  process.exit(1);
}

// Replace by finding the exact block
const initStart = content.indexOf('  // \u2500\u2500 Init \u2500');
if (initStart === -1) {
  // Try alternate search
  const altStart = content.indexOf('  init() {');
  if (altStart === -1) { console.error('Cannot find init'); process.exit(1); }
}

// Use the OLD_INIT string to splice: find it and replace
const idx = content.indexOf('init() {');
if (idx === -1) { console.error('init() not found'); process.exit(1); }

// Find the comment line before it
const commentMarker = '  // \u2500\u2500 Init';
const cmtIdx = content.indexOf(commentMarker);
if (cmtIdx === -1) { console.error('Init comment not found'); process.exit(1); }

// Find closing brace of init() – search for '\n  }\n\n  async syncFromServer'
const syncMarker = '\n  async syncFromServer()';
const syncIdx = content.indexOf(syncMarker);
if (syncIdx === -1) { console.error('syncFromServer not found'); process.exit(1); }

const before = content.slice(0, cmtIdx);
const after  = content.slice(syncIdx);
const patched = before + NEW_INIT + '\n' + after;

fs.writeFileSync(filePath, patched, 'utf8');
console.log('state.js init() patched to async with server-first loading.');
console.log('Total lines:', patched.split('\n').length);
