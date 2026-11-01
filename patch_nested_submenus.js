const fs = require('fs');
const path = require('path');

const baseDir = 'C:\\Users\\U S E R - P C\\.gemini\\antigravity-ide\\scratch\\elementor-builder';

// ============================================================================
// 1. UPDATE js/widgets.js
// ============================================================================
const widgetsPath = path.join(baseDir, 'js', 'widgets.js');
let widgetsCode = fs.readFileSync(widgetsPath, 'utf8');

// A. Update navbar schema links children
const oldLinksSchema = `        {
          key: 'links',
          label: 'Nav Links',
          type: 'repeater',
          fields: [
            { key: 'label', label: 'Link Label', type: 'text' },
            { key: 'url', label: 'Target Page / URL', type: 'page-link' },
            { key: 'children', label: 'Submenu Items (Label | URL per line, or JSON)', type: 'textarea' }
          ]
        }`;

const newLinksSchema = `        {
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

if (widgetsCode.includes(oldLinksSchema)) {
  widgetsCode = widgetsCode.replace(oldLinksSchema, newLinksSchema);
  console.log('widgets.js: Updated navbar links schema.');
} else {
  console.log('widgets.js: Old schema pattern not found or already updated.');
}

// B. Update parseSublinks to handle object arrays with label/url/link/title/name
const oldParseSublinks = `      const parseSublinks = (raw) => {
        if (!raw) return [];
        if (Array.isArray(raw)) return raw;`;

const newParseSublinks = `      const parseSublinks = (raw) => {
        if (!raw) return [];
        if (Array.isArray(raw)) {
          return raw.map((s) => {
            if (typeof s === 'string') return { label: s, url: '#' };
            return {
              label: s.label || s.title || s.name || 'Sublink',
              url: s.url || s.link || '#'
            };
          });
        }`;

if (widgetsCode.includes(oldParseSublinks)) {
  widgetsCode = widgetsCode.replace(oldParseSublinks, newParseSublinks);
  console.log('widgets.js: Updated parseSublinks.');
} else {
  console.log('widgets.js: parseSublinks already updated or not matched.');
}

// C. Ensure subActive and subUrl check both url and link
const oldSubMap = `          const subHtml = childrenList.map((s) => {
            const item = typeof s === 'string' ? { label: s, url: '#' } : (s || {});
            const subActive = isLinkActive(item.url) ? 'active' : '';
            return \`<li><a href="\${item.url || '#'}" class="wb-nav-sublink \${subActive}" style="\${props.textColor ? \`color:\${props.textColor};\` : ''}">\${item.label || 'Sublink'}</a></li>\`;
          }).join('');`;

const newSubMap = `          const subHtml = childrenList.map((s) => {
            const item = typeof s === 'string' ? { label: s, url: '#' } : (s || {});
            const subUrl = item.url || item.link || '#';
            const subLabel = item.label || item.title || item.name || 'Sublink';
            const subActive = isLinkActive(subUrl) ? 'active' : '';
            return \`<li><a href="\${subUrl}" class="wb-nav-sublink \${subActive}" style="\${props.textColor ? \`color:\${props.textColor};\` : ''}">\${subLabel}</a></li>\`;
          }).join('');`;

if (widgetsCode.includes(oldSubMap)) {
  widgetsCode = widgetsCode.replace(oldSubMap, newSubMap);
  console.log('widgets.js: Updated subHtml mapping.');
}

fs.writeFileSync(widgetsPath, widgetsCode, 'utf8');
console.log('widgets.js saved!');

// ============================================================================
// 2. UPDATE js/inspector.js
// ============================================================================
const inspectorPath = path.join(baseDir, 'js', 'inspector.js');
let inspectorCode = fs.readFileSync(inspectorPath, 'utf8');

// A. Replace the nested repeater call in createRepeaterControl
const oldNestedHandler = `        if (subField.type === 'repeater') {
          const nestedWrap = document.createElement('div');
          nestedWrap.style.cssText = 'padding:10px;background:rgba(255,255,255,0.025);border-radius:8px;border:1px dashed var(--border-subtle);margin-top:6px;';
          const nestedTitle = document.createElement('div');
          nestedTitle.style.cssText = 'font-size:0.75rem;font-weight:700;color:#c7d2fe;margin-bottom:6px;display:flex;align-items:center;gap:6px;';
          nestedTitle.innerHTML = \`<span>↳ \${subField.label || subField.key}</span>\`;
          nestedWrap.appendChild(nestedTitle);

          const nestedControl = this.createRepeaterControl({ props: item }, subField);
          nestedWrap.appendChild(nestedControl);
          subGroup.appendChild(nestedWrap);
        }`;

const newNestedHandler = `        if (subField.type === 'repeater' || subField.key === 'children' || subField.key === 'subItems') {
          const nestedControl = this.createNestedSubmenuControl(item, subField);
          subGroup.appendChild(nestedControl);
        }`;

if (inspectorCode.includes(oldNestedHandler)) {
  inspectorCode = inspectorCode.replace(oldNestedHandler, newNestedHandler);
  console.log('inspector.js: Replaced nested handler.');
} else {
  console.log('inspector.js: Old nested handler not matched, checking if already replaced...');
}

// B. Append createNestedSubmenuControl to InspectorPanel before the closing brace
const createNestedSubmenuCode = `
  createNestedSubmenuControl(item, subField) {
    const box = document.createElement('div');
    box.className = 'nested-repeater-box';

    // Normalize items: auto-convert string or JSON into clean array of objects
    let subItems = item[subField.key];
    if (typeof subItems === 'string' && subItems.trim()) {
      try {
        if (subItems.trim().startsWith('[') || subItems.trim().startsWith('{')) {
          const parsed = JSON.parse(subItems);
          subItems = Array.isArray(parsed) ? parsed : (parsed.links || parsed.children || parsed.items || []);
        } else {
          subItems = subItems.split(/\\r?\\n/).map(l => l.trim()).filter(Boolean).map(line => {
            if (line.includes('|')) {
              const parts = line.split('|');
              return { label: parts[0]?.trim() || 'Link', url: parts[1]?.trim() || '#' };
            }
            return { label: line, url: '#' };
          });
        }
      } catch (e) {
        subItems = [];
      }
    }
    if (!Array.isArray(subItems)) {
      subItems = [];
    }
    item[subField.key] = subItems;

    // Header
    const header = document.createElement('div');
    header.className = 'nested-repeater-header';
    
    const titleSpan = document.createElement('span');
    titleSpan.innerHTML = \`<span>↳ \${subField.label || 'Submenu Items'}</span>\`;
    
    const countBadge = document.createElement('span');
    countBadge.className = 'nested-repeater-count';
    const updateCount = () => {
      countBadge.textContent = \`\${subItems.length} \${subItems.length === 1 ? 'item' : 'items'}\`;
    };
    updateCount();

    header.appendChild(titleSpan);
    header.appendChild(countBadge);
    box.appendChild(header);

    // List Container
    const listContainer = document.createElement('div');
    listContainer.style.display = 'flex';
    listContainer.style.flexDirection = 'column';
    listContainer.style.gap = '8px';
    box.appendChild(listContainer);

    const emptyHint = document.createElement('div');
    emptyHint.className = 'nested-empty-hint';
    emptyHint.textContent = 'No submenu items yet. Click "+ Add Submenu Item" below.';

    const renderRows = () => {
      listContainer.innerHTML = '';
      if (subItems.length === 0) {
        listContainer.appendChild(emptyHint);
        return;
      }

      subItems.forEach((sub, subIdx) => {
        const row = document.createElement('div');
        row.className = 'nested-item-row';

        // Top mini-bar: # Index & Delete button
        const rowTop = document.createElement('div');
        rowTop.className = 'nested-item-topbar';

        const idxLabel = document.createElement('span');
        idxLabel.className = 'nested-item-idx';
        idxLabel.textContent = \`Sub-item #\${subIdx + 1}\`;

        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'nested-item-del-btn';
        delBtn.innerHTML = '✕ Remove';
        delBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          subItems.splice(subIdx, 1);
          state.saveDraft();
          state.notify('propUpdate');
          renderRows();
          updateCount();
        });

        rowTop.appendChild(idxLabel);
        rowTop.appendChild(delBtn);
        row.appendChild(rowTop);

        // Submenu Label Input
        const labelInput = document.createElement('input');
        labelInput.type = 'text';
        labelInput.placeholder = 'Submenu Item Label (e.g. College of Law)';
        labelInput.value = sub.label || sub.title || '';
        labelInput.style.fontSize = '0.8rem';
        labelInput.style.padding = '5px 8px';
        labelInput.addEventListener('input', (e) => {
          sub.label = e.target.value;
          state.saveDraft();
          state.notify('propUpdate');
        });
        row.appendChild(labelInput);

        // Submenu Target / Page Selector
        const pageSelect = document.createElement('select');
        pageSelect.style.fontSize = '0.78rem';
        pageSelect.style.padding = '4px 6px';

        const defOpt = document.createElement('option');
        defOpt.value = '';
        defOpt.textContent = '📄 Select Page or Custom Anchor...';
        pageSelect.appendChild(defOpt);

        (state.pages || []).forEach((p) => {
          const opt = document.createElement('option');
          const targetUrl = p.slug === 'index' ? 'index.html' : \`?page=\${p.slug}\`;
          opt.value = targetUrl;
          opt.textContent = \`📄 \${p.title} (\${p.slug === 'index' ? 'Home' : \`?page=\${p.slug}\`})\`;
          if ((sub.url || sub.link) === targetUrl) opt.selected = true;
          pageSelect.appendChild(opt);
        });

        const urlInput = document.createElement('input');
        urlInput.type = 'text';
        urlInput.placeholder = 'URL, #anchor, or choose page above';
        urlInput.value = sub.url || sub.link || '';
        urlInput.style.fontSize = '0.78rem';
        urlInput.style.padding = '4px 8px';

        pageSelect.addEventListener('change', (e) => {
          if (e.target.value) {
            urlInput.value = e.target.value;
            sub.url = e.target.value;
            delete sub.link;
            state.saveDraft();
            state.notify('propUpdate');
          }
        });

        urlInput.addEventListener('input', (e) => {
          sub.url = e.target.value;
          delete sub.link;
          state.saveDraft();
          state.notify('propUpdate');
        });

        const linkWrap = document.createElement('div');
        linkWrap.style.display = 'flex';
        linkWrap.style.flexDirection = 'column';
        linkWrap.style.gap = '4px';
        linkWrap.appendChild(pageSelect);
        linkWrap.appendChild(urlInput);
        row.appendChild(linkWrap);

        listContainer.appendChild(row);
      });
    };

    renderRows();

    // Add Submenu Item Button
    const addSubBtn = document.createElement('button');
    addSubBtn.type = 'button';
    addSubBtn.className = 'nested-add-btn';
    addSubBtn.innerHTML = '+ Add Submenu Item';
    addSubBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      subItems.push({ label: 'New Submenu Link', url: '#' });
      state.saveDraft();
      state.notify('propUpdate');
      renderRows();
      updateCount();
      const inputs = listContainer.querySelectorAll('input');
      if (inputs.length > 0) inputs[inputs.length - 2].focus();
    });

    box.appendChild(addSubBtn);
    return box;
  }
`;

if (!inspectorCode.includes('createNestedSubmenuControl')) {
  const lastBrace = inspectorCode.lastIndexOf('}');
  inspectorCode = inspectorCode.slice(0, lastBrace) + createNestedSubmenuCode + '\n' + inspectorCode.slice(lastBrace);
  console.log('inspector.js: Added createNestedSubmenuControl method.');
}

fs.writeFileSync(inspectorPath, inspectorCode, 'utf8');
console.log('inspector.js saved!');

// ============================================================================
// 3. UPDATE css/builder.css
// ============================================================================
const cssPath = path.join(baseDir, 'css', 'builder.css');
let cssCode = fs.readFileSync(cssPath, 'utf8');

const nestedCss = `
/* Nested Submenu / Repeater Builder Styling */
.nested-repeater-box {
  background: rgba(15, 23, 42, 0.45);
  border: 1px solid rgba(99, 102, 241, 0.2);
  border-radius: 8px;
  padding: 10px;
  margin-top: 6px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.nested-repeater-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 0.76rem;
  font-weight: 700;
  color: #c7d2fe;
}
.nested-repeater-count {
  font-size: 0.68rem;
  background: rgba(99, 102, 241, 0.2);
  color: #a5b4fc;
  padding: 2px 7px;
  border-radius: 12px;
  font-weight: 600;
}
.nested-item-row {
  background: rgba(255, 255, 255, 0.035);
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 6px;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  transition: border-color 0.15s ease;
}
.nested-item-row:hover {
  border-color: rgba(99, 102, 241, 0.4);
}
.nested-item-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.nested-item-idx {
  font-size: 0.7rem;
  font-weight: 700;
  color: var(--text-dim);
}
.nested-item-del-btn {
  background: transparent;
  border: none;
  color: #ef4444;
  font-size: 0.75rem;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 4px;
  transition: all 0.15s ease;
}
.nested-item-del-btn:hover {
  background: rgba(239, 68, 68, 0.15);
  color: #f87171;
}
.nested-add-btn {
  background: rgba(99, 102, 241, 0.12);
  border: 1px dashed rgba(99, 102, 241, 0.35);
  color: #c7d2fe;
  font-size: 0.75rem;
  font-weight: 600;
  padding: 6px 12px;
  border-radius: 6px;
  cursor: pointer;
  text-align: center;
  transition: all 0.15s ease;
}
.nested-add-btn:hover {
  background: rgba(99, 102, 241, 0.25);
  border-color: rgba(99, 102, 241, 0.6);
  color: #ffffff;
}
.nested-empty-hint {
  font-size: 0.72rem;
  color: var(--text-dim);
  font-style: italic;
  padding: 4px 2px;
}
`;

if (!cssCode.includes('nested-repeater-box')) {
  cssCode += '\n' + nestedCss;
  fs.writeFileSync(cssPath, cssCode, 'utf8');
  console.log('builder.css: Added nested repeater styles.');
}

console.log('All nested submenu updates completed successfully!');

