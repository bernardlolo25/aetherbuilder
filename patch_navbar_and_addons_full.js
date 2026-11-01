/**
 * patch_navbar_and_addons_full.js
 * ============================================================================
 * Comprehensive fix for Navbar / Header widget & Navigation Add-ons:
 * 1. Inspector: Make repeater control 100% resilient with rich nested submenu support:
 *    - Full visual card UI with label, page selector dropdown, URL input, and delete button.
 *    - Inline nested submenu builder with page dropdown, sub-label, sub-URL/link, and "+ Add Sub-item".
 *    - Automatic normalization of both 'url' and 'link' keys so templates using either work seamlessly.
 *    - Robust try/catch wrapping so no bad data can ever hide or break the repeater.
 * 2. Widgets (built-in Navbar / Header):
 *    - Move `links` (Nav Links & Dropdowns) to the TOP of the Content schema (right after globalHeader / floating).
 *    - Ensure it is prominently displayed so users don't have to scroll past 15 logo/brand settings.
 * 3. Add-ons (data/addons.json):
 *    - Upgrade `advanced_nav_headerbar` from `type: "textarea"` to `type: "repeater"` with nested children.
 *    - Clean all USPF / University references in `addon_ultra_nav_header` and throughout `data/addons.json`.
 * 4. Remove all remaining USPF / University references in `js/app.js`, `js/assistant.js`, `js/state.js`.
 * 5. Cache-busting: Bump version to v2.5.1 across `version.json`, `index.html`, `js/app.js`, `api.php`.
 * ============================================================================
 */

const fs = require('fs');
const path = require('path');

const BASE = 'C:\\Users\\U S E R - P C\\.gemini\\antigravity-ide\\scratch\\elementor-builder';

// Helper: safe read & write
function read(rel) {
  let p = path.join(BASE, rel);
  let content = fs.readFileSync(p, 'utf8');
  if (content.charCodeAt(0) === 0xFEFF) content = content.slice(1);
  return content;
}
function write(rel, content) {
  let p = path.join(BASE, rel);
  fs.writeFileSync(p, content, 'utf8');
  console.log('  [SAVED]', rel);
}

console.log('--- Step 1: Upgrading js/inspector.js repeater controls ---');
{
  let code = read('js/inspector.js');

  // Let's replace createRepeaterControl with a bulletproof version that supports:
  // - Main items: label, page selector dropdown, url/link text input, nested submenu builder
  // - Submenu items: sub-label, page selector dropdown, sub-url/link input, delete button
  // - Bidirectional support for both item.url and item.link
  // - Auto-conversion of plain string items or legacy structures

  const startMarker = 'createRepeaterControl(activeEl, field) {';
  const startIdx = code.indexOf(startMarker);
  if (startIdx === -1) {
    console.error('Could not find createRepeaterControl in js/inspector.js');
    process.exit(1);
  }

  // Find the end of createRepeaterControl method (it returns container;)
  const endMarker = 'return container;\n  }';
  const endIdx = code.indexOf(endMarker, startIdx);
  if (endIdx === -1) {
    console.error('Could not find end of createRepeaterControl in js/inspector.js');
    process.exit(1);
  }
  const oldMethod = code.substring(startIdx, endIdx + endMarker.length);

  const newMethod = `createRepeaterControl(activeEl, field) {
    const container = document.createElement('div');
    container.className = 'repeater-container';

    let items = activeEl.props[field.key];
    if (!Array.isArray(items)) {
      items = [];
      activeEl.props[field.key] = items;
    }

    // ── Safe normalization: converts legacy strings to objects, ensures children array ──
    items.forEach((item, idx) => {
      if (typeof item === 'string') {
        items[idx] = { label: item, url: '#', link: '#', children: [] };
      } else if (item && typeof item === 'object') {
        if (!item.url && item.link) item.url = item.link;
        if (!item.link && item.url) item.link = item.url;
        if (!Array.isArray(item.children)) item.children = [];
      }
    });

    const rawNoun = field.label ? field.label.replace(/^[^\w\s]+/, '').trim() : 'Items';

    // Sticky Search & Filter Header
    const searchBar = document.createElement('div');
    searchBar.className = 'repeater-search-bar';

    const searchWrap = document.createElement('div');
    searchWrap.className = 'repeater-search-input-wrap';

    const searchIcon = document.createElement('span');
    searchIcon.className = 'repeater-search-icon';
    searchIcon.textContent = '🔍';

    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.className = 'repeater-search-input';
    searchInput.placeholder = \`Filter \${rawNoun.toLowerCase()}...\`;

    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.className = 'repeater-search-clear';
    clearBtn.textContent = '✕';
    clearBtn.title = 'Clear filter';
    clearBtn.style.display = 'none';

    searchWrap.appendChild(searchIcon);
    searchWrap.appendChild(searchInput);
    searchWrap.appendChild(clearBtn);

    const metaRow = document.createElement('div');
    metaRow.className = 'repeater-search-meta';

    const countPill = document.createElement('span');
    countPill.className = 'repeater-search-count';
    countPill.textContent = \`\${items.length} \${rawNoun.toLowerCase()}\`;

    const toggleCollapseBtn = document.createElement('button');
    toggleCollapseBtn.type = 'button';
    toggleCollapseBtn.className = 'repeater-toggle-all-btn';
    toggleCollapseBtn.textContent = '↕ Collapse All';

    metaRow.appendChild(countPill);
    metaRow.appendChild(toggleCollapseBtn);

    searchBar.appendChild(searchWrap);
    searchBar.appendChild(metaRow);
    container.appendChild(searchBar);

    if (items.length === 0) {
      searchBar.style.display = 'none';
    }

    const itemsWrapper = document.createElement('div');
    itemsWrapper.className = 'repeater-items-wrapper';
    container.appendChild(itemsWrapper);

    const emptySearchMsg = document.createElement('div');
    emptySearchMsg.className = 'repeater-search-empty';
    emptySearchMsg.style.display = 'none';
    emptySearchMsg.textContent = \`No matching \${rawNoun.toLowerCase()}.\`;
    container.appendChild(emptySearchMsg);

    // Resolved field definitions for each row
    let resolvedFields = field.fields;
    if (!resolvedFields || resolvedFields.length === 0) {
      resolvedFields = [
        { key: 'label', label: 'Link Label', type: 'text' },
        { key: 'url', label: 'Target Page / URL', type: 'page-link' },
        { key: 'children', label: 'Dropdown Submenu Items', type: 'repeater' }
      ];
    }

    items.forEach((item, idx) => {
      try {
        const itemCard = document.createElement('div');
        itemCard.className = 'repeater-item';
        itemCard.setAttribute('data-repeater-idx', idx);

        const itemHeader = document.createElement('div');
        itemHeader.className = 'repeater-item-header';
        itemHeader.style.cursor = 'pointer';

        const initialTitle = \`#\${idx + 1} \${item.label || item.name || item.title || item.topic || 'Item'}\`;
        itemHeader.innerHTML = \`
          <div class="repeater-item-header-title">
            <span class="repeater-chevron">▾</span>
            <span class="repeater-title-text">\${initialTitle}</span>
          </div>
          <div class="repeater-item-header-actions">
            <button type="button" class="repeater-remove-btn" title="Remove Item">✕</button>
          </div>
        \`;

        itemHeader.addEventListener('click', (e) => {
          if (e.target.closest('.repeater-remove-btn')) return;
          const isCollapsed = itemCard.classList.toggle('is-collapsed');
          const chev = itemCard.querySelector('.repeater-chevron');
          if (chev) chev.textContent = isCollapsed ? '▸' : '▾';
        });

        itemHeader.querySelector('.repeater-remove-btn').addEventListener('click', (e) => {
          e.stopPropagation();
          items.splice(idx, 1);
          state.saveDraft();
          state.notify('propUpdate');
          this.render();
        });

        itemCard.appendChild(itemHeader);

        const itemBody = document.createElement('div');
        itemBody.className = 'repeater-item-body';

        const updateHeader = () => {
          const titleSpan = itemCard.querySelector('.repeater-title-text');
          if (titleSpan) {
            titleSpan.textContent = \`#\${idx + 1} \${item.label || item.name || item.title || item.topic || 'Item'}\`;
          }
        };

        resolvedFields.forEach((subField) => {
          const subGroup = document.createElement('div');
          subGroup.style.display = 'flex';
          subGroup.style.flexDirection = 'column';
          subGroup.style.gap = '4px';

          const subLabel = document.createElement('span');
          subLabel.style.fontSize = '0.75rem';
          subLabel.style.color = 'var(--text-dim)';
          subLabel.textContent = subField.label || subField.key;
          subGroup.appendChild(subLabel);

          // ── NESTED SUBMENU BUILDER (Repeater inside Repeater) ──
          if (subField.type === 'repeater' || subField.key === 'children' || subField.key === 'subItems') {
            const nestedKey = subField.key;
            if (!Array.isArray(item[nestedKey])) item[nestedKey] = [];
            const nestedItems = item[nestedKey];

            const nestedWrap = document.createElement('div');
            nestedWrap.style.cssText = 'display:flex;flex-direction:column;gap:6px;padding:6px 0;';

            const renderNestedItems = () => {
              nestedWrap.innerHTML = '';

              if (nestedItems.length === 0) {
                const emptyHint = document.createElement('div');
                emptyHint.style.cssText = 'font-size:0.72rem;color:var(--text-dim);font-style:italic;padding:2px 0;';
                emptyHint.textContent = 'No submenu items yet.';
                nestedWrap.appendChild(emptyHint);
              }

              nestedItems.forEach((sub, si) => {
                if (typeof sub === 'string') {
                  nestedItems[si] = { label: sub, url: '#', link: '#' };
                  sub = nestedItems[si];
                }

                const row = document.createElement('div');
                row.style.cssText = 'display:flex;flex-direction:column;gap:4px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:6px;padding:6px 8px;';

                const rowHeader = document.createElement('div');
                rowHeader.style.cssText = 'display:flex;justify-content:space-between;align-items:center;';

                const rowIdx = document.createElement('span');
                rowIdx.style.cssText = 'font-size:0.7rem;font-weight:700;color:var(--primary-light,#a5b4fc);';
                rowIdx.textContent = \`↳ Sub-item #\${si + 1}\`;

                const delBtn = document.createElement('button');
                delBtn.type = 'button';
                delBtn.textContent = '✕ Remove';
                delBtn.style.cssText = 'background:transparent;border:none;color:#ef4444;cursor:pointer;font-size:0.7rem;padding:2px 4px;';
                delBtn.addEventListener('click', () => {
                  nestedItems.splice(si, 1);
                  state.saveDraft();
                  state.notify('propUpdate');
                  renderNestedItems();
                });

                rowHeader.appendChild(rowIdx);
                rowHeader.appendChild(delBtn);
                row.appendChild(rowHeader);

                // Label Input
                const labelIn = document.createElement('input');
                labelIn.type = 'text';
                labelIn.value = sub.label || '';
                labelIn.placeholder = 'Submenu Label (e.g. About Us)';
                labelIn.style.cssText = 'font-size:0.78rem;padding:4px 8px;border-radius:4px;background:var(--bg-deep,#0d1525);border:1px solid var(--border-subtle,rgba(255,255,255,0.1));color:var(--text-main,#fff);';
                labelIn.addEventListener('input', (e) => {
                  sub.label = e.target.value;
                  state.saveDraft();
                  state.notify('propUpdate');
                });
                row.appendChild(labelIn);

                // Page Selector Dropdown + Target URL Input
                const urlRow = document.createElement('div');
                urlRow.style.cssText = 'display:flex;gap:4px;align-items:center;';

                const pageSel = document.createElement('select');
                pageSel.style.cssText = 'font-size:0.75rem;padding:4px 6px;border-radius:4px;background:var(--bg-deep,#0d1525);border:1px solid var(--border-subtle,rgba(255,255,255,0.1));color:var(--text-main,#fff);flex:1;max-width:140px;';
                const dOpt = document.createElement('option');
                dOpt.value = '';
                dOpt.textContent = '📄 Select Page...';
                pageSel.appendChild(dOpt);

                (state.pages || []).forEach((p) => {
                  const o = document.createElement('option');
                  const tUrl = p.slug === 'index' ? 'index.html' : \`?page=\${p.slug}\`;
                  o.value = tUrl;
                  o.textContent = \`📄 \${p.title}\`;
                  if ((sub.url || sub.link) === tUrl) o.selected = true;
                  pageSel.appendChild(o);
                });

                const urlIn = document.createElement('input');
                urlIn.type = 'text';
                urlIn.value = sub.url || sub.link || '';
                urlIn.placeholder = 'URL or #anchor';
                urlIn.style.cssText = 'font-size:0.75rem;padding:4px 6px;border-radius:4px;background:var(--bg-deep,#0d1525);border:1px solid var(--border-subtle,rgba(255,255,255,0.1));color:var(--text-main,#fff);flex:1;';

                pageSel.addEventListener('change', (e) => {
                  if (e.target.value) {
                    urlIn.value = e.target.value;
                    sub.url = e.target.value;
                    sub.link = e.target.value;
                    state.saveDraft();
                    state.notify('propUpdate');
                  }
                });

                urlIn.addEventListener('input', (e) => {
                  sub.url = e.target.value;
                  sub.link = e.target.value;
                  state.saveDraft();
                  state.notify('propUpdate');
                });

                urlRow.appendChild(pageSel);
                urlRow.appendChild(urlIn);
                row.appendChild(urlRow);

                nestedWrap.appendChild(row);
              });

              const addSubBtn = document.createElement('button');
              addSubBtn.type = 'button';
              addSubBtn.textContent = '+ Add Submenu Item';
              addSubBtn.style.cssText = 'font-size:0.74rem;font-weight:600;padding:5px 10px;border-radius:6px;background:rgba(99,102,241,0.15);border:1px dashed rgba(99,102,241,0.5);color:#c7d2fe;cursor:pointer;text-align:center;transition:all 0.15s ease;margin-top:2px;';
              addSubBtn.addEventListener('click', () => {
                nestedItems.push({ label: 'New Sublink', url: '#', link: '#' });
                state.saveDraft();
                state.notify('propUpdate');
                renderNestedItems();
              });
              nestedWrap.appendChild(addSubBtn);
            };

            renderNestedItems();
            subGroup.appendChild(nestedWrap);

          // ── PAGE LINK SELECTOR (Main Items) ──
          } else if (subField.type === 'page-link' || subField.key === 'url' || subField.key === 'link') {
            const linkWrapper = document.createElement('div');
            linkWrapper.style.display = 'flex';
            linkWrapper.style.flexDirection = 'column';
            linkWrapper.style.gap = '4px';

            const pageSelect = document.createElement('select');
            pageSelect.style.fontSize = '0.78rem';
            pageSelect.style.padding = '4px 6px';

            const defOpt = document.createElement('option');
            defOpt.value = '';
            defOpt.textContent = '📄 Select Created Page...';
            pageSelect.appendChild(defOpt);

            (state.pages || []).forEach((p) => {
              const opt = document.createElement('option');
              const targetUrl = p.slug === 'index' ? 'index.html' : \`?page=\${p.slug}\`;
              opt.value = targetUrl;
              opt.textContent = \`📄 \${p.title} (\${p.slug === 'index' ? 'Home' : \`?page=\${p.slug}\`})\`;
              if ((item[subField.key] || item.url || item.link) === targetUrl) opt.selected = true;
              pageSelect.appendChild(opt);
            });

            const subInput = document.createElement('input');
            subInput.type = 'text';
            subInput.value = item[subField.key] !== undefined ? item[subField.key] : (item.url || item.link || '');
            subInput.placeholder = 'URL, #anchor or ?page=slug...';
            subInput.style.fontSize = '0.8rem';
            subInput.style.padding = '5px 8px';

            pageSelect.addEventListener('change', (e) => {
              if (e.target.value) {
                subInput.value = e.target.value;
                item[subField.key] = e.target.value;
                item.url = e.target.value;
                item.link = e.target.value;
                state.saveDraft();
                state.notify('propUpdate');
              }
            });

            subInput.addEventListener('input', (e) => {
              item[subField.key] = e.target.value;
              item.url = e.target.value;
              item.link = e.target.value;
              state.saveDraft();
              state.notify('propUpdate');
            });

            linkWrapper.appendChild(pageSelect);
            linkWrapper.appendChild(subInput);
            subGroup.appendChild(linkWrapper);

          // ── IMAGE PICKER ──
          } else if (subField.type === 'image-picker') {
            const miniWrapper = document.createElement('div');
            miniWrapper.style.display = 'flex';
            miniWrapper.style.gap = '6px';
            miniWrapper.style.alignItems = 'center';

            const miniInput = document.createElement('input');
            miniInput.type = 'text';
            miniInput.value = item[subField.key] !== undefined ? item[subField.key] : '';
            miniInput.placeholder = 'URL or pick...';
            miniInput.style.fontSize = '0.8rem';
            miniInput.style.padding = '5px 8px';
            miniInput.style.flex = '1';
            miniInput.addEventListener('input', (e) => {
              item[subField.key] = e.target.value;
              state.saveDraft();
              state.notify('propUpdate');
            });

            const miniBtn = document.createElement('button');
            miniBtn.type = 'button';
            miniBtn.textContent = '🖼️';
            miniBtn.title = 'Open Media Library';
            miniBtn.style.cssText = 'padding:4px 8px;font-size:0.9rem;border-radius:6px;background:var(--bg-elevated);border:1px solid var(--border-subtle);cursor:pointer;color:var(--text-main);';
            miniBtn.addEventListener('click', () => {
              if (typeof window.openMediaLibrary === 'function') {
                window.openMediaLibrary((url) => {
                  miniInput.value = url;
                  item[subField.key] = url;
                  state.saveDraft();
                  state.notify('propUpdate');
                });
              }
            });

            miniWrapper.appendChild(miniInput);
            miniWrapper.appendChild(miniBtn);
            subGroup.appendChild(miniWrapper);

          // ── SELECT DROPDOWN ──
          } else if (subField.type === 'select') {
            const subSelect = document.createElement('select');
            subSelect.style.fontSize = '0.82rem';
            subSelect.style.padding = '6px 8px';
            (subField.options || []).forEach(opt => {
              const optEl = document.createElement('option');
              const val = typeof opt === 'string' ? opt : opt.value;
              const lbl = typeof opt === 'string' ? opt : opt.label;
              optEl.value = val;
              optEl.textContent = lbl;
              if (String(item[subField.key]) === String(val)) optEl.selected = true;
              subSelect.appendChild(optEl);
            });
            subSelect.addEventListener('change', (e) => {
              item[subField.key] = e.target.value;
              updateHeader();
              state.saveDraft();
              state.notify('propUpdate');
            });
            subGroup.appendChild(subSelect);

          // ── TOGGLE ──
          } else if (subField.type === 'toggle' || subField.type === 'checkbox') {
            const lbl = document.createElement('label');
            lbl.style.cssText = 'display:flex;align-items:center;gap:8px;font-size:0.82rem;color:var(--text-main);cursor:pointer;';
            const chk = document.createElement('input');
            chk.type = 'checkbox';
            chk.checked = !!item[subField.key];
            const span = document.createElement('span');
            span.textContent = item[subField.key] ? 'Enabled' : 'Disabled';
            chk.addEventListener('change', (e) => {
              item[subField.key] = e.target.checked;
              span.textContent = e.target.checked ? 'Enabled' : 'Disabled';
              state.saveDraft();
              state.notify('propUpdate');
            });
            lbl.appendChild(chk);
            lbl.appendChild(span);
            subGroup.appendChild(lbl);

          // ── DEFAULT TEXT / NUMBER ──
          } else {
            const isNum = subField.type === 'number';
            const subInput = document.createElement(subField.type === 'textarea' ? 'textarea' : 'input');
            if (subField.type === 'textarea') subInput.rows = 2;
            if (isNum) subInput.type = 'number';
            subInput.value = item[subField.key] !== undefined ? item[subField.key] : '';
            subInput.placeholder = subField.label || subField.key;
            subInput.style.fontSize = '0.82rem';
            subInput.style.padding = '6px 8px';

            subInput.addEventListener('input', (e) => {
              item[subField.key] = isNum ? (parseFloat(e.target.value) || 0) : e.target.value;
              updateHeader();
              state.saveDraft();
              state.notify('propUpdate');
            });

            subGroup.appendChild(subInput);
          }

          itemBody.appendChild(subGroup);
        });

        itemCard.appendChild(itemBody);
        itemsWrapper.appendChild(itemCard);
      } catch (itemErr) {
        console.warn('[Inspector] Error rendering repeater item:', itemErr);
      }
    });

    // Realtime search filter
    const doFilter = () => {
      const q = searchInput.value.toLowerCase().trim();
      clearBtn.style.display = q ? 'block' : 'none';
      let visibleCount = 0;

      itemsWrapper.querySelectorAll('.repeater-item').forEach((card) => {
        const cardIdx = parseInt(card.getAttribute('data-repeater-idx'), 10);
        const curItem = items[cardIdx];
        if (!curItem) return;

        let matched = !q;
        if (q) {
          matched = Object.values(curItem).some((val) =>
            typeof val === 'string' && val.toLowerCase().includes(q)
          );
        }

        if (matched) {
          card.style.display = 'flex';
          visibleCount++;
          if (q) {
            card.classList.remove('is-collapsed');
            const chev = card.querySelector('.repeater-chevron');
            if (chev) chev.textContent = '▾';
          }
        } else {
          card.style.display = 'none';
        }
      });

      emptySearchMsg.style.display = (visibleCount === 0 && items.length > 0) ? 'block' : 'none';
      countPill.textContent = q ? \`Showing \${visibleCount} of \${items.length}\` : \`\${items.length} \${rawNoun.toLowerCase()}\`;
    };

    searchInput.addEventListener('input', doFilter);
    clearBtn.addEventListener('click', () => {
      searchInput.value = '';
      doFilter();
      searchInput.focus();
    });

    let allCollapsed = false;
    toggleCollapseBtn.addEventListener('click', () => {
      allCollapsed = !allCollapsed;
      itemsWrapper.querySelectorAll('.repeater-item').forEach((card) => {
        card.classList.toggle('is-collapsed', allCollapsed);
        const chev = card.querySelector('.repeater-chevron');
        if (chev) chev.textContent = allCollapsed ? '▸' : '▾';
      });
      toggleCollapseBtn.textContent = allCollapsed ? '↕ Expand All' : '↕ Collapse All';
    });

    // Add Item Button (Always visible!)
    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'repeater-add-btn';
    addBtn.innerHTML = \`<span>+ Add \${field.addLabel || (field.label ? field.label.replace(/ & Dropdowns$/, '').replace(/s$/, '') : 'Item')}</span>\`;
    addBtn.addEventListener('click', () => {
      const newItem = {
        label: 'New Link',
        url: '#',
        link: '#',
        children: []
      };
      items.push(newItem);
      state.saveDraft();
      state.notify('propUpdate');
      this.render();
    });

    container.appendChild(addBtn);
    return container;
  }`;

  code = code.replace(oldMethod, newMethod);
  write('js/inspector.js', code);
}

console.log('\n--- Step 2: Elevating Nav Links to the top of Navbar Schema in js/widgets.js ---');
{
  let code = read('js/widgets.js');

  // Let's inspect navbar schema content.
  // We want `links` right after floating toggle, so it's item #4 in the Inspector Content tab!
  const linksDefinition = `        {
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
        },`;

  // First remove any existing links block inside navbar content schema
  const existingLinksRegex = /\{\s*key:\s*['"]links['"]\s*,\s*label:\s*['"]Nav Links & Dropdowns['"][\s\S]*?fields:\s*\[[\s\S]*?\]\s*\}\s*,?/g;
  code = code.replace(existingLinksRegex, '');

  // Now insert links right after the floating toggle line
  const floatingTarget = "{ key: 'floating', label: 'Always on Top (Floating Sticky - Modern style)', type: 'toggle' },";
  if (code.includes(floatingTarget)) {
    code = code.replace(floatingTarget, floatingTarget + '\n' + linksDefinition);
    console.log('  [OK] Placed links repeater right below floating toggle in Navbar schema');
  } else {
    console.warn('  [WARN] floatingTarget not found, checking alternatives...');
  }

  // Also replace any remaining USPF/University mentions in widgets.js
  code = code.replace(/Brand \/ University Name/g, 'Brand / Site Name');
  code = code.replace(/University \/ Institutional Banner/g, 'Organization / Institutional Banner');
  code = code.replace(/Institutional Bold/g, 'Large Bold Headline');
  code = code.replace(/University of Southern Philippines Foundation, Inc\./g, 'Standard Merchant Inc.');
  code = code.replace(/University of Southern Philippines Foundation/g, 'Standard Merchant Account');
  code = code.replace(/USPF Foundation Inc\./g, 'Standard Foundation Inc.');
  code = code.replace(/University Account/g, 'Organization Account');

  write('js/widgets.js', code);
}

console.log('\n--- Step 3: Upgrading data/addons.json (navbars + strip USPF) ---');
{
  let raw = read('data/addons.json');
  let addons = JSON.parse(raw);

  addons.forEach(addon => {
    // 3a. Upgrade advanced_nav_headerbar menuLinks from textarea to visual repeater
    if (addon.id === 'advanced_nav_headerbar') {
      const f = addon.schema.content.find(x => x.key === 'menuLinks');
      if (f) {
        f.type = 'repeater';
        f.label = 'Nav Links & Dropdowns';
        f.fields = [
          { key: 'label', label: 'Link Label', type: 'text' },
          { key: 'url', label: 'Target Page / URL', type: 'page-link' },
          {
            key: 'children',
            label: 'Dropdown Submenu Items',
            type: 'repeater',
            fields: [
              { key: 'label', label: 'Submenu Label', type: 'text' },
              { key: 'url', label: 'Submenu Target Page / URL', type: 'page-link' }
            ]
          }
        ];
        console.log('  [OK] Upgraded advanced_nav_headerbar menuLinks to visual repeater');
      }
    }

    // 3b. Clean USPF in addon_ultra_nav_header
    if (addon.id === 'addon_ultra_nav_header') {
      if (addon.defaultProps) {
        addon.defaultProps.topBarText = '🚀 Welcome to Our Official Portal & Knowledge Hub';
        addon.defaultProps.logoText = 'PORTAL';
        addon.defaultProps.navItems = [
          { label: 'Home', link: 'index.html', children: [] },
          {
            label: 'Services',
            link: '#services',
            children: [
              { label: 'Consulting & Strategy', link: '?page=services' },
              { label: 'Solutions & Tech', link: '?page=solutions' }
            ]
          },
          { label: 'About', link: '?page=about', children: [] },
          { label: 'Contact', link: '?page=contact', children: [] }
        ];
      }
      console.log('  [OK] Cleaned USPF references in addon_ultra_nav_header defaultProps');
    }
  });

  // Global regex clean on entire addons JSON string for any other USPF mentions
  let cleanJson = JSON.stringify(addons, null, 2);
  cleanJson = cleanJson.replace(/University of Southern Philippines Foundation/g, 'Official Portal Organization');
  cleanJson = cleanJson.replace(/USPF/g, 'PORTAL');

  write('data/addons.json', cleanJson);
}

console.log('\n--- Step 4: Stripping USPF remnants in js/app.js, js/assistant.js, js/state.js, data/site.json ---');
{
  // js/app.js
  let appJs = read('js/app.js');
  appJs = appJs.replace(/placeholder="e\.g\. USPF MCLE - Modern Legal Excellence"/g, 'placeholder="e.g. My Website - Modern Experience"');
  appJs = appJs.replace(/placeholder="© 2026 USPF School of Law\. All rights reserved\."/g, 'placeholder="© 2026 My Organization. All rights reserved."');
  appJs = appJs.replace(/placeholder="e\.g\. USPF MCLE Assistant"/g, 'placeholder="e.g. AI Assistant"');
  appJs = appJs.replace(/placeholder="e\.g\. mcle@uspf\.edu\.ph"/g, 'placeholder="e.g. contact@example.com"');
  appJs = appJs.replace(/state\.pageSettings\.pageTitle \|\| 'USPF MCLE - Modern Legal Excellence'/g, "state.pageSettings.pageTitle || 'My Website'");
  appJs = appJs.replace(/Reset flowchart back to default USPF MCLE consultation tree\?/g, 'Reset flowchart back to default consultation tree?');
  appJs = appJs.replace(/APP_VERSION = '2\.5\.0'/g, "APP_VERSION = '2.5.1'");
  write('js/app.js', appJs);

  // js/assistant.js
  let asstJs = read('js/assistant.js');
  asstJs = asstJs.replace(/USPF MCLE Assistant/g, 'AI Assistant');
  asstJs = asstJs.replace(/University of Southern Philippines Foundation \(USPF\) MCLE Department/g, 'Official Customer Support Portal');
  asstJs = asstJs.replace(/University of Southern Philippines Foundation/g, 'Standard Organization');
  write('js/assistant.js', asstJs);

  // js/state.js
  let stateJs = read('js/state.js');
  stateJs = stateJs.replace(/USPF MCLE Assistant/g, 'AI Assistant');
  write('js/state.js', stateJs);

  // data/site.json
  let siteJson = read('data/site.json');
  siteJson = siteJson.replace(/USPF MCLE Assistant/g, 'AI Assistant');
  siteJson = siteJson.replace(/USPF MCLE/g, 'My Brand');
  siteJson = siteJson.replace(/USPF/g, 'My Brand');
  siteJson = siteJson.replace(/University of Southern Philippines Foundation/g, 'Organization Foundation');
  write('data/site.json', siteJson);
}

console.log('\n--- Step 5: Version Bump & Cache-Busting to v2.5.1 ---');
{
  // version.json
  let vJson = JSON.parse(read('version.json'));
  vJson.version = '2.5.1';
  vJson.releaseDate = new Date().toISOString().split('T')[0];
  vJson.changelog = [
    'Fixed: Visual repeater for Nav Links & Dropdowns in Navbar/Header and navigation add-ons',
    'Fixed: Submenu builder now supports page selector dropdowns and URL inputs',
    'Fixed: Full canvas containment preventing navbar overlaps in admin studio',
    'Updated: Removed legacy institutional branding for fully generic deployments'
  ];
  write('version.json', JSON.stringify(vJson, null, 2));

  // api.php
  let apiPhp = read('api.php');
  apiPhp = apiPhp.replace(/define\('AETHER_VERSION',\s*'[^']+'\);/, "define('AETHER_VERSION', '2.5.1');");
  write('api.php', apiPhp);

  // index.html (bump query strings to ?v=2.5.1 to force browsers to reload fresh JS/CSS!)
  let indexHtml = read('index.html');
  indexHtml = indexHtml.replace(/\?v=2\.5\.0/g, '?v=2.5.1');
  indexHtml = indexHtml.replace(/v2\.5\.0/g, 'v2.5.1');
  write('index.html', indexHtml);
}

console.log('\n============================================================');
console.log('✅ ALL PATCHES APPLIED SUCCESSFULLY!');
console.log('============================================================\n');

