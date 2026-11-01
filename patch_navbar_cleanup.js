/**
 * patch_navbar_cleanup.js
 * =======================
 * 1. Restores the visual "Nav Links & Dropdowns" repeater in the Navbar inspector.
 * 2. Strips all University / USPF-specific labels and sample data from every widget.
 * 3. Renames the "institutional" headerStyle option to generic "Government / Org Banner".
 */

const fs = require('fs');
const BASE = 'C:\\Users\\U S E R - P C\\.gemini\\antigravity-ide\\scratch\\elementor-builder';

// ─── helpers ────────────────────────────────────────────────────────────────
function patch(label, filePath, searchStr, replaceStr) {
  let content = fs.readFileSync(filePath, 'utf8');
  if (!content.includes(searchStr)) {
    console.warn(`  ⚠  [${label}] search string not found — skipping`);
    return content;
  }
  const result = content.split(searchStr).join(replaceStr);
  fs.writeFileSync(filePath, result, 'utf8');
  console.log(`  ✓  ${label}`);
  return result;
}

function replaceAll(label, filePath, pairs) {
  let content = fs.readFileSync(filePath, 'utf8');
  let changed = false;
  for (const [search, replace] of pairs) {
    if (content.includes(search)) {
      content = content.split(search).join(replace);
      changed = true;
      console.log(`  ✓  ${label}: "${search.slice(0, 60).replace(/\n/g, '↵')}..."`);
    }
  }
  if (changed) fs.writeFileSync(filePath, content, 'utf8');
  else console.log(`  ℹ  ${label}: nothing matched`);
}

const widgetsJs = `${BASE}\\js\\widgets.js`;

// ─── 1. Strip USPF / University text across all widgets ─────────────────────
replaceAll('Strip USPF/University references', widgetsJs, [
  // field labels
  ['Brand / University Name',                          'Brand / Site Name'],
  ['University / Institutional Banner (Image 2)',      'Organization / Institutional Banner'],
  // sample payment data
  ['University of Southern Philippines Foundation, Inc.', 'Sample Organization Name'],
  ['University of Southern Philippines Foundation',    'Sample Organization Name'],
  ['University Account',                               'Organization Account'],
  ['USPF Foundation Inc.',                             'Sample Foundation Inc.'],
  // any remaining USPF abbreviation
  ['USPF',                                             'ORG'],
]);

// ─── 2. Restore links repeater schema in the Navbar widget ───────────────────
// The repeater was lost when patch_nested_submenus.js ran. Re-apply the full definition.
patch(
  'Navbar links repeater schema — restore page-link selector',
  widgetsJs,
  // Old / broken minimal line that may exist
  `{ key: 'label', label: 'Link Label', type: 'text' },
              { key: 'url', label: 'Target Page / URL', type: 'page-link' },`,
  // Full correct definition (label + page-link + sub-items)
  `{ key: 'label',    label: 'Link Label',       type: 'text'      },
              { key: 'url',      label: 'Target Page / URL', type: 'page-link' },
              {
                key: 'children',
                label: 'Sub-menu Items',
                type: 'repeater',
                fields: [
                  { key: 'label', label: 'Sub Label',   type: 'text' },
                  { key: 'url',   label: 'Sub URL / Page', type: 'page-link' }
                ]
              },`
);

// ─── 3. Guard: reset defaultProps.links to a clean empty array ───────────────
// (avoids stale USPF-named pages showing up as defaults)
{
  let content = fs.readFileSync(widgetsJs, 'utf8');
  // Replace any hard-coded default links that still contain old USPF page slugs
  const oldDefaults = [
    `{ label: 'Features', url: '#features' },\n          { label: 'Stats', url: '#stats' },\n          { label: 'Gallery', url: '#gallery' },\n          { label: 'Showcase', url: '#slider' },\n          { label: 'FAQ', url: '#faq' }`,
  ];
  const newDefaults = `{ label: 'Home', url: '#' },\n          { label: 'About', url: '#about' },\n          { label: 'Services', url: '#services' },\n          { label: 'Contact', url: '#contact' }`;
  let changed = false;
  for (const old of oldDefaults) {
    if (content.includes(old)) {
      content = content.split(old).join(newDefaults);
      changed = true;
    }
  }
  if (changed) {
    fs.writeFileSync(widgetsJs, content, 'utf8');
    console.log('  ✓  Navbar defaultProps.links — replaced USPF slugs with generic defaults');
  } else {
    console.log('  ℹ  Navbar defaultProps.links — already generic, no change');
  }
}

console.log('\nAll done! Now run:\n  node build_package.js\n  node build_update_zip.js\n');

