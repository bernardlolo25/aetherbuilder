# AetherBuilder — Visual Web Studio & AI Page Builder

A modern, fast, zero-dependency visual website builder with dynamic AI capabilities, drag-and-drop components, interactive widgets, guided tour mascot, and responsive previewing.

---

## 🚀 Deployment Options

### 1. Vercel (Serverless Cloud Architecture)
AetherBuilder is fully configured for Vercel deployment with serverless routing via `vercel.json` and `/api/index.js`.

1. **Deploy to Vercel:**
   - Push this repository to GitHub/GitLab.
   - Import the project into Vercel.
   - Framework Preset: **Other** (Static / Serverless).
   - Output Directory: **.** (root).

2. **Add Persistent Database (Required for Vercel Serverless):**
   Serverless functions run in ephemeral containers. To persist site publishes, submissions, and add-ons across cold-starts, configure one of the following:

   - **Option A: Vercel KV / Upstash Redis (Recommended & Easiest)**
     - In your Vercel Project Dashboard, navigate to the **Storage** tab.
     - Click **Create Database** -> select **KV**.
     - Vercel automatically injects `KV_REST_API_URL` and `KV_REST_API_TOKEN`.
     - *Done! AetherBuilder automatically detects and uses Vercel KV.*

   - **Option B: Supabase (PostgreSQL)**
     - Set `SUPABASE_URL` and `SUPABASE_KEY` in Vercel Project Environment Variables.

3. **Add Cloudinary (For Images & Transparent Mascot Videos):**
   Bypasses Vercel's 4.5MB serverless body limit, enables uploading large transparent WebM mascot videos (10MB+), and delivers media through Cloudinary's global edge CDN.

   - Sign up for free at [Cloudinary](https://cloudinary.com) (includes 25GB free monthly bandwidth/storage).
   - In Vercel Project Environment Variables, set:
     ```env
     CLOUDINARY_CLOUD_NAME=your_cloud_name
     CLOUDINARY_API_KEY=your_api_key
     CLOUDINARY_API_SECRET=your_api_secret
     CLOUDINARY_FOLDER=aether-assets
     ```
   - *Alternatively*, you can connect Cloudinary directly in the browser via **Media Library > Cloudinary: Setup** using an Unsigned Upload Preset.

---

### 2. Local Node.js Development

Run the included local development server:
```bash
# Start local server on port 3000
node server.js
# Or on Windows PowerShell:
.\serve.ps1
```
Open [http://localhost:3000/index.html?view=admin](http://localhost:3000/index.html?view=admin) in your browser.

---

### 3. PHP / Apache Hosting (InfinityFree, cPanel, Shared Hosts)
Upload all files including `api.php` and `.htaccess` to your `public_html` directory.
PHP 7.4+ is supported with zero external dependencies.

---

## 🛠️ Environment Variables Reference

See `.env.example` for all configurable variables:

| Variable | Description | Default |
| :--- | :--- | :--- |
| `GEMINI_API_KEY` | Google Gemini AI API key for prompt generation | Optional |
| `KV_REST_API_URL` | Vercel KV / Upstash REST URL | Optional (fallback to local fs) |
| `KV_REST_API_TOKEN` | Vercel KV / Upstash REST Token | Optional |
| `SUPABASE_URL` | Supabase Project URL | Optional |
| `SUPABASE_KEY` | Supabase Service Role or Anon API Key | Optional |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary Cloud Name | Optional (fallback to local) |
| `CLOUDINARY_API_KEY` | Cloudinary API Key | Optional |
| `CLOUDINARY_API_SECRET` | Cloudinary API Secret for signed uploads | Optional |
| `CLOUDINARY_UPLOAD_PRESET`| Cloudinary Unsigned Upload Preset name | Optional |
| `CLOUDINARY_FOLDER` | Upload folder in Cloudinary | `aether-assets` |
