/**
 * patch_fix_links_repeater.js
 * ===========================
 * ROOT CAUSE: `this.createNestedSubmenuControl(item, subField)` is called at
 * inspector.js line 1300 but the method does NOT exist — throws TypeError and
 * silently breaks the entire "Nav Links & Dropdowns" repeater.
 *
 * FIX:
 *  1. Replace the broken call with inline nested submenu rendering.
 *  2. Move `links` field to the TOP of the navbar content schema so it's
 *     immediately visible — no scrolling required.
 *  3. Remove the `state.saveDraft()` call inside normalization (may throw if
 *     state isn't defined at that exact moment).
 */

const fs = require('fs');
const BASE = 'C:\\Users\\U S E R - P C\\.gemini\\antigravity-ide\\scratch\\elementor-builder';
const inspectorJs = BASE + '\\js\\inspector.js';
const widgetsJs   = BASE + '\\js\\widgets.js';

// ─── FIX 1: Replace broken createNestedSubmenuControl call ──────────────────
{
  let js = fs.readFileSync(inspectorJs, 'utf8');

  const OLD = `        if (subField.type === 'repeater' || subField.key === 'children' || subField.key === 'subItems') {
          const nestedControl = this.createNestedSubmenuControl(item, subField);
          subGroup.appendChild(nestedControl);
        }`;

  // Replace with a proper inline nested submenu builder
  const NEW = `        if (subField.type === 'repeater' || subField.key === 'children' || subField.key === 'subItems') {
          // Inline nested submenu control (visual card list with add/remove)
          const nestedKey = subField.key;
          if (!Array.isArray(item[nestedKey])) item[nestedKey] = [];
          const nestedItems = item[nestedKey];

          const nestedWrap = document.createElement('div');
          nestedWrap.style.cssText = 'display:flex;flex-direction:column;gap:4px;padding:4px 0;';

          const renderNestedItems = () => {
            nestedWrap.innerHTML = '';
            nestedItems.forEach((sub, si) => {
              const row = document.createElement('div');
              row.style.cssText = 'display:flex;gap:4px;align-items:center;background:var(--bg-card,#1e293b);border-radius:6px;padding:4px 6px;';

              const labelIn = document.createElement('input');
              labelIn.type = 'text';
              labelIn.value = sub.label || '';
              labelIn.placeholder = 'Label';
              labelIn.style.cssText = 'flex:1;font-size:0.75rem;padding:3px 6px;border-radius:4px;background:var(--bg-deep,#0d1525);border:1px solid var(--border-subtle,rgba(255,255,255,0.1));color:var(--text-main,#fff);';
              labelIn.addEventListener('input', e => { sub.label = e.target.value; state.saveDraft(); state.notify('propUpdate'); });

              const urlIn = document.createElement('input');
              urlIn.type = 'text';
              urlIn.value = sub.url || sub.link || '';
              urlIn.placeholder = 'URL / #anchor';
              urlIn.style.cssText = 'flex:1;font-size:0.75rem;padding:3px 6px;border-radius:4px;background:var(--bg-deep,#0d1525);border:1px solid var(--border-subtle,rgba(255,255,255,0.1));color:var(--text-main,#fff);';
              urlIn.addEventListener('input', e => { sub.url = e.target.value; state.saveDraft(); state.notify('propUpdate'); });

              const delBtn = document.createElement('button');
              delBtn.type = 'button';
              delBtn.textContent = '✕';
              delBtn.title = 'Remove';
              delBtn.style.cssText = 'background:transparent;border:none;color:#ef4444;cursor:pointer;font-size:0.8rem;padding:2px 4px;flex-shrink:0;';
              delBtn.addEventListener('click', () => { nestedItems.splice(si, 1); state.saveDraft(); state.notify('propUpdate'); renderNestedItems(); });

              row.appendChild(labelIn);
              row.appendChild(urlIn);
              row.appendChild(delBtn);
              nestedWrap.appendChild(row);
            });

            const addSubBtn = document.createElement('button');
            addSubBtn.type = 'button';
            addSubBtn.textContent = '+ Add Sub-item';
            addSubBtn.style.cssText = 'font-size:0.72rem;padding:3px 8px;border-radius:5px;background:rgba(99,102,241,0.12);border:1px dashed rgba(99,102,241,0.4);color:#c7d2fe;cursor:pointer;text-align:center;';
            addSubBtn.addEventListener('click', () => { nestedItems.push({ label: '', url: '' }); state.saveDraft(); state.notify('propUpdate'); renderNestedItems(); });
            nestedWrap.appendChild(addSubBtn);
          };
          renderNestedItems();
          subGroup.appendChild(nestedWrap);
        }`;

  if (!js.includes(OLD)) {
    console.error('  ✗ Could not find broken createNestedSubmenuControl call — check inspector.js manually');
    process.exit(1);
  }
  js = js.split(OLD).join(NEW);
  fs.writeFileSync(inspectorJs, js, 'utf8');
  console.log('  ✓ inspector.js — replaced broken createNestedSubmenuControl with inline renderer');
}

// ─── FIX 2: Remove state.saveDraft() from normalization (may throw early) ───
{
  let js = fs.readFileSync(inspectorJs, 'utf8');
  const OLD = `      if (normalized) { state.saveDraft(); }`;
  const NEW = `      // (auto-save deferred — happens on next user interaction)`;
  if (js.includes(OLD)) {
    js = js.split(OLD).join(NEW);
    fs.writeFileSync(inspectorJs, js, 'utf8');
    console.log('  ✓ inspector.js — removed premature state.saveDraft() from normalization block');
  } else {
    console.log('  ℹ inspector.js — normalization saveDraft already cleaned');
  }
}

// ─── FIX 3: Move `links` repeater to TOP of navbar content schema ────────────
// Currently it's last, after ctaLink. Move it to be right after globalHeader.
{
  let js = fs.readFileSync(widgetsJs, 'utf8');

  // The current links field block in content schema
  const LINKS_BLOCK = `        {
          key: 'links',
          label: 'Nav Links & Dropdowns',
          type: 'repeater',
          fields: [
            { key: 'label', label: 'Link Label', type: 'text' },
            { key: 'url', label: 'Target Page / URL', type: 'page-link' },
            {
              key: 'children',
              label: 'Dropdown Submenu Items',
              type: 'repeater',
              fields: [
                { key: 'label', label: 'Submenu Link Label', type: 'text' },
                { key: 'url', label: 'Submenu Target Page / URL', type: 'page-link' }
              ]
            }
          ]
        }`;

  // The anchor point: insert AFTER the globalHeader toggle
  const ANCHOR = `        { key: 'globalHeader', label: 'dYO? Display Globally Across All Pages', type: 'toggle' },`;

  if (!js.includes(LINKS_BLOCK)) {
    console.error('  ✗ Could not find links block to move — check widgets.js manually');
    process.exit(1);
  }
  if (!js.includes(ANCHOR)) {
    console.log('  ⚠ Could not find anchor for links move — leaving in place');
  } else {
    // Remove from current position (with trailing comma if present)
    js = js.replace(LINKS_BLOCK + '\n      ],', '\n      ],');  // end of array
    js = js.replace(LINKS_BLOCK + ',\n', '');
    js = js.replace(LINKS_BLOCK, '');

    // Insert after globalHeader line
    const INSERT_AFTER = ANCHOR;
    const LINKS_WITH_COMMA = `\n        {\n          key: 'links',\n          label: 'Nav Links & Dropdowns',\n          type: 'repeater',\n          fields: [\n            { key: 'label', label: 'Link Label', type: 'text' },\n            { key: 'url', label: 'Target Page / URL', type: 'page-link' },\n            {\n              key: 'children',\n              label: 'Dropdown Sub-menu Items',\n              type: 'repeater',\n              fields: [\n                { key: 'label', label: 'Sub Label', type: 'text' },\n                { key: 'url',   label: 'Sub URL',   type: 'page-link' }\n              ]\n            }\n          ]\n        },`;

    js = js.replace(INSERT_AFTER, INSERT_AFTER + LINKS_WITH_COMMA);
    fs.writeFileSync(widgetsJs, js, 'utf8');
    console.log('  ✓ widgets.js — moved links repeater to TOP of content schema (after globalHeader)');
  }
}

console.log('\n✅ All done! Rebuild:\n  node build_package.js\n  node build_update_zip.js\n');

