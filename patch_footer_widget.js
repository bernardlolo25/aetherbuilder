/**
 * patch_footer_widget.js
 * Adds globalFooter + fixedBottom props to the footer widget in js/widgets.js.
 * Run: node patch_footer_widget.js
 */
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'js', 'widgets.js');
let content = fs.readFileSync(filePath, 'utf8');

// ── 1. Add new defaultProps ───────────────────────────────────────────────────
const OLD_DEFAULT = "    defaultProps: {\n      showOnlyCopyright: false,\n      copyrightAlignment: 'center',";
const NEW_DEFAULT = "    defaultProps: {\n      globalFooter: false,\n      fixedBottom: false,\n      showOnlyCopyright: false,\n      copyrightAlignment: 'center',";

if (!content.includes(OLD_DEFAULT)) {
  console.error('defaultProps target not found - checking content...');
  const idx = content.indexOf('showOnlyCopyright: false');
  console.log('showOnlyCopyright at index:', idx);
  console.log('Context:', content.slice(Math.max(0, idx-60), idx+80));
  process.exit(1);
}
content = content.split(OLD_DEFAULT).join(NEW_DEFAULT);
console.log('Step 1 OK: defaultProps updated');

// ── 2. Add new schema entries ─────────────────────────────────────────────────
// Find the footer schema content array - it's after the description
const OLD_SCHEMA = "        { key: 'showOnlyCopyright', label: '\u26A1 Display Only Copyright Section (Minimal Footer)', type: 'toggle' },";
const NEW_SCHEMA = "        { key: 'globalFooter', label: '\uD83C\uDF10 Display Globally Across All Pages', type: 'toggle' },\n        { key: 'fixedBottom', label: '\uD83D\uDCCC Float Fixed at Bottom of Screen', type: 'toggle' },\n        { key: 'showOnlyCopyright', label: '\u26A1 Display Only Copyright Section (Minimal Footer)', type: 'toggle' },";

if (!content.includes(OLD_SCHEMA)) {
  console.error('Schema target not found');
  process.exit(1);
}
content = content.split(OLD_SCHEMA).join(NEW_SCHEMA);
console.log('Step 2 OK: schema updated');

// ── 3. Inject fixedStyle variable before Mode 1 comment ───────────────────────
// We insert JS code right before "// Mode 1: Display ONLY Copyright Section"
const OLD_MODE1_COMMENT = "      // Mode 1: Display ONLY Copyright Section";
const NEW_MODE1_PREAMBLE =
  "      // Fixed bottom positioning (applied to both footer modes)\n" +
  "      const fixedStyle = props.fixedBottom\n" +
  "        ? 'position: fixed; bottom: 0; left: 0; right: 0; z-index: 900; width: 100%;'\n" +
  "        : '';\n\n" +
  "      // Mode 1: Display ONLY Copyright Section";

if (!content.includes(OLD_MODE1_COMMENT)) {
  console.error('Mode 1 comment not found');
  process.exit(1);
}
content = content.split(OLD_MODE1_COMMENT).join(NEW_MODE1_PREAMBLE);
console.log('Step 3 OK: fixedStyle variable injected');

// ── 4. Apply fixedStyle to minimal footer ─────────────────────────────────────
// The minimal footer <footer> tag - insert fixedStyle into inline style
const OLD_MINIMAL_TAG = '<footer class="wb-footer is-minimal" style="padding: 24px 20px;';
const NEW_MINIMAL_TAG = '<footer class="wb-footer is-minimal" style="${fixedStyle} padding: 24px 20px;';

if (!content.includes(OLD_MINIMAL_TAG)) {
  console.error('Minimal footer tag not found');
  process.exit(1);
}
content = content.split(OLD_MINIMAL_TAG).join(NEW_MINIMAL_TAG);
console.log('Step 4 OK: minimal footer tag updated');

// ── 5. Apply fixedStyle to full footer ────────────────────────────────────────
// The full footer <footer> tag
const OLD_FULL_TAG = '<footer class="wb-footer">';
const NEW_FULL_TAG = '<footer class="wb-footer" style="${fixedStyle}">';

// Only replace the last occurrence (inside footer render, not earlier HTML)
const lastOccurrence = content.lastIndexOf(OLD_FULL_TAG);
if (lastOccurrence === -1) {
  console.error('Full footer tag not found');
  process.exit(1);
}
content = content.slice(0, lastOccurrence) + NEW_FULL_TAG + content.slice(lastOccurrence + OLD_FULL_TAG.length);
console.log('Step 5 OK: full footer tag updated');

fs.writeFileSync(filePath, content, 'utf8');
console.log('\nwidgets.js footer patched successfully with globalFooter + fixedBottom.');
