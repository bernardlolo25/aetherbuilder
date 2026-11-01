const fs = require('fs');
const cssPath = 'C:\\Users\\U S E R - P C\\.gemini\\antigravity-ide\\scratch\\elementor-builder\\css\\builder.css';

const cssToAdd = `
/* ==========================================================================
   AETHERBUILDER - 1-CLICK SYSTEM UPDATER (WORDPRESS STYLE)
   ========================================================================== */
.update-available-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  color: #ffffff;
  font-size: 0.72rem;
  font-weight: 700;
  padding: 3px 9px;
  border-radius: 20px;
  cursor: pointer;
  box-shadow: 0 0 12px rgba(16, 185, 129, 0.4);
  animation: updatePulseGlow 2s infinite ease-in-out;
  transition: all 0.2s ease;
  user-select: none;
}
.update-available-pill:hover {
  transform: translateY(-1px) scale(1.02);
  box-shadow: 0 0 16px rgba(16, 185, 129, 0.6);
}
@keyframes updatePulseGlow {
  0%, 100% { box-shadow: 0 0 8px rgba(16, 185, 129, 0.35); }
  50% { box-shadow: 0 0 16px rgba(16, 185, 129, 0.7); }
}

.update-modal-tabs {
  display: flex;
  gap: 8px;
  border-bottom: 1px solid var(--border-subtle);
  margin-bottom: 20px;
}
.update-modal-tab {
  padding: 8px 16px;
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--text-dim);
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  transition: all 0.2s ease;
}
.update-modal-tab.active {
  color: var(--primary-light, #a5b4fc);
  border-bottom-color: var(--primary, #6366f1);
}

.update-system-checks {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
  gap: 10px;
  margin-bottom: 18px;
}
.update-check-item {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  padding: 8px 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.update-check-item .check-label {
  font-size: 0.68rem;
  color: var(--text-dim);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.update-check-item .check-value {
  font-size: 0.8rem;
  font-weight: 600;
  color: #10b981;
  display: flex;
  align-items: center;
  gap: 4px;
}
.update-check-item .check-value.warn {
  color: #f59e0b;
}
.update-check-item .check-value.fail {
  color: #ef4444;
}

.update-changelog-card {
  background: rgba(15, 23, 42, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  padding: 14px 16px;
  margin-bottom: 18px;
  max-height: 200px;
  overflow-y: auto;
}
.update-changelog-card h4 {
  font-size: 0.85rem;
  font-weight: 700;
  margin: 0 0 10px 0;
  color: #f1f5f9;
}
.update-changelog-list {
  margin: 0;
  padding-left: 18px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.update-changelog-list li {
  font-size: 0.82rem;
  color: var(--text-muted, #94a3b8);
  line-height: 1.45;
}

.update-progress-container {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 16px 0;
}
.update-progress-bar-bg {
  width: 100%;
  height: 8px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 4px;
  overflow: hidden;
}
.update-progress-bar-fill {
  height: 100%;
  width: 0%;
  background: linear-gradient(90deg, #6366f1, #10b981);
  border-radius: 4px;
  transition: width 0.3s ease;
}
.update-progress-status {
  font-size: 0.8rem;
  color: var(--text-dim);
  display: flex;
  justify-content: space-between;
}

.update-dropzone {
  border: 2px dashed rgba(99, 102, 241, 0.35);
  background: rgba(99, 102, 241, 0.04);
  border-radius: 12px;
  padding: 28px 16px;
  text-align: center;
  cursor: pointer;
  transition: all 0.2s ease;
}
.update-dropzone:hover, .update-dropzone.dragover {
  border-color: var(--primary, #6366f1);
  background: rgba(99, 102, 241, 0.1);
}
`;

let currentCss = fs.readFileSync(cssPath, 'utf8');
if (!currentCss.includes('update-available-pill')) {
  fs.appendFileSync(cssPath, cssToAdd, 'utf8');
  console.log('builder.css successfully updated with updater styles!');
} else {
  console.log('Updater styles already present in builder.css.');
}

