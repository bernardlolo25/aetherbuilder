# ⚡ AetherBuilder - Modern Visual Web Builder & Publisher

A modern, responsive, visual website builder featuring a **Public View** and an **Admin Studio** protected by **Argon2id cryptographic password hashing** with WebAssembly acceleration.

---

## 🌟 Key Features

### 1. Two Distinct Views
* **🌐 Public View (`?view=public` or `public.html`)**:
  * High-performance, clean live website rendered from your published draft.
  * Zero builder clutter, optimized semantic HTML.
  * Live interactive components: smooth scroll, auto-playing sliders with touch/click swipe, animated stat counters, and category-filtered photo galleries with a full-screen lightbox modal.
  * Floating bottom-right pill for 1-click transition to Admin Studio.
* **🔐 Admin Studio View (`?view=admin` or `admin.html`)**:
  * **Protected by Argon2id Cryptographic Hashing**: Memory-hard WebAssembly algorithm resisting brute-force and dictionary attacks.
  * **Left Sidebar**: Searchable widget drawer categorized by Layout, Content, and Media.
  * **Live Property Inspector**: Three tabbed panels (**Content**, **Style**, and **Advanced**) for inspecting and tweaking any selected element in real time.
  * **WYSIWYG Canvas**: Live preview with multi-device viewport scaling (Desktop 100%, Tablet 768px, Mobile 390px).
  * **Inline Editing**: Double-click any heading or paragraph on the canvas to edit text directly inline!
  * **Section Controls**: Add section, duplicate section, move up/down, delete, and add new sections at any position.
  * **Undo / Redo History**: Full revision snapshot stack with keyboard shortcuts (`Ctrl+Z`, `Ctrl+Y`).
  * **1-Click Publishing**: Instantly publishes the active builder draft to the live public view with state persistence (`localStorage`).
  * **Pre-Built Template Library**: 1-click loading of complete themes ("SaaS Launchpad Pro" and "Creative Studio & Portfolio").
  * **Export & Import Suite**: Export project to JSON, import JSON, or download a standalone production `index.html` bundle.

---

### 2. Available Widgets & Elements
1. **🧭 Header / Navbar**: Always-on-top / floating glass capsule, custom logo image (SVG/PNG/JPG) or icon, destination logo click link, navigation menu links, and CTA button.
2. **🚀 Hero Section**: High-impact headline, gradient text highlights, subtitle, dual action buttons (Primary + Secondary), and glowing background mesh.
3. **📦 Body / Section Container**: Multi-column responsive layout engine (1, 2, 3, or 4 columns, uneven splits), custom padding, and background color.
4. **📊 Counter Widget**: Numbers count up dynamically with custom prefixes (e.g. `$`), suffixes (e.g. `%`, `+`, `K`), labels, and icons.
5. **🖼️ Gallery Widget**: Multi-column grid with category filter buttons (All, Abstract, Technology, Workspace) and an interactive full-screen **Lightbox Modal** with navigation.
6. **🎠 Slider / Carousel Widget**: Smooth multi-slide carousel with auto-play interval, prev/next arrows, pagination dots, customizable per-slide CTA buttons with text and link support (with target `_blank` toggle).
7. **🔘 Action Button Widget**: Standalone call-to-action button supporting custom styles (Glow, Primary, Gradient, Outline, Secondary), sizes (Small, Medium, Large), alignments (Left, Center, Right, Full Width), icons, links, and subtext micro-copy.
8. **📰 Text & Image Block**: Split editorial layout (Image Left or Right), headline, body copy, and a feature checklist.
9. **➖ Section Divider**: Sleek dividers with multiple styles (Neon Glow, Subtle Solid, Dashed, SVG Wave Curve, and Centered Badge).
10. **💎 Feature Grid**: 3-card responsive grid highlighting capabilities with glowing icon boxes.
11. **💳 Pricing Table**: Tiered pricing cards (Starter, Pro Studio, Enterprise) with feature checklists, badges, and action buttons.
12. **❓ FAQ Accordion**: Expandable and collapsible question and answer accordion cards.
13. **✉️ Contact Form**: Clean inputs with live validation, submit state, and confirmation toast notifications.
14. **🔻 Footer**: Multi-column footer with brand summary, links, and copyright notice.

---

## 🔐 Argon2 Authentication
* **Default Password on First Run**: `admin123`
* **Cryptographic Parameters**:
  * Algorithm: `Argon2id (PHC format: $argon2id$v=19$m=4096,t=3,p=1$...)`
  * Execution: WebAssembly acceleration via `hash-wasm`
  * Salt: 16-byte cryptographically secure random values via `crypto.getRandomValues()`
  * Memory: 4 MB (4096 KB)
  * Iterations: 3 passes
* You can update your master password anytime in the Admin Studio by clicking the **🔐 Argon2id Active** badge in the top navigation bar.

---

## 🚀 How to Run Locally

The application is served directly by the included local PowerShell server on port 3000:

1. Open your browser and navigate to:
   * **Admin Studio**: [http://localhost:3000/?view=admin](http://localhost:3000/?view=admin) (Default password: `admin123`)
   * **Public Website**: [http://localhost:3000/?view=public](http://localhost:3000/?view=public)
2. To restart the local server at any time, run:
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\serve.ps1 -Port 3000
   ```

---

## 📁 Directory Structure
```
aether-builder/
├── index.html           # Main entry point (router for public & admin)
├── public.html          # Public view shortcut
├── admin.html           # Admin studio shortcut
├── serve.ps1            # Lightweight PowerShell static HTTP server
├── css/
│   ├── design-system.css # Design tokens, colors, glassmorphism, typography
│   ├── widgets.css       # Styling for all visual widgets
│   ├── builder.css       # Admin studio UI, topbar, sidebar, inspector, modals
│   └── animations.css    # Keyframe transitions, counter pulse, lightbox
└── js/
    ├── vendor/
    │   └── argon2.umd.min.js # Local offline-capable WebAssembly Argon2 library
    ├── auth.js          # Argon2 hashing, salt generation, session manager
    ├── state.js         # Reactive page store, undo/redo stacks, auto-save
    ├── widgets.js       # Widget registry, inspector schemas, and HTML renderers
    ├── inspector.js     # Property controls panel (Content, Style, Advanced)
    ├── builder.js       # Canvas manager, drag handles, inline editor, widget events
    ├── templates.js     # Ready-made demo templates (SaaS Pro & Portfolio)
    └── app.js           # App bootstrap, topbar actions, and route management
```
