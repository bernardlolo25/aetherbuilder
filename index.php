<?php
/**
 * AetherBuilder — index.php
 * PHP wrapper to prevent LiteSpeed/server-side caching of this entry point.
 * Identical to index.html but served as PHP so it's never statically cached.
 */
header('Cache-Control: no-cache, no-store, must-revalidate');
header('Pragma: no-cache');
header('Expires: 0');

// Comprehensive Browser Defense & Security Headers (Defense-in-depth for OpenResty / LiteSpeed)
header('Strict-Transport-Security: max-age=31536000; includeSubDomains; preload');
header('X-Frame-Options: SAMEORIGIN');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: strict-origin-when-cross-origin');
header('Permissions-Policy: camera=(self), microphone=(), geolocation=(), payment=()');
header("Content-Security-Policy: default-src 'self' 'unsafe-inline' https: data: blob:; script-src 'self' 'unsafe-inline' 'unsafe-eval' https: blob: data:; style-src 'self' 'unsafe-inline' https:; font-src 'self' https: data:; img-src 'self' data: blob: https:; media-src 'self' https: data: blob:; connect-src 'self' https: wss: blob:; frame-src 'self' https:; frame-ancestors 'self';");

// Dynamic SEO & OpenGraph Social Sharing Metadata
$siteDataFile = __DIR__ . '/data/site.json';
$siteTitle = 'AetherBuilder';
$siteDesc  = 'Modern visual website builder';
$ogImage   = '';
$favicon   = 'favicon.png';

if (file_exists($siteDataFile)) {
    $siteJson = @json_decode(file_get_contents($siteDataFile), true);
    if (is_array($siteJson)) {
        $ss = $siteJson['siteSettings'] ?? [];
        if (!empty($ss['siteTitle'])) {
            $siteTitle = $ss['siteTitle'];
        } elseif (!empty($ss['siteName'])) {
            $siteTitle = $ss['siteName'];
        }
        if (!empty($ss['siteDescription'])) {
            $siteDesc = $ss['siteDescription'];
        } elseif (!empty($ss['metaDescription'])) {
            $siteDesc = $ss['metaDescription'];
        } elseif (!empty($ss['siteName'])) {
            $siteDesc = $ss['siteName'] . ' - Official Website';
        }
        if (!empty($ss['brandLogoUrl'])) {
            $ogImage = $ss['brandLogoUrl'];
        } elseif (!empty($ss['faviconUrl'])) {
            $ogImage = $ss['faviconUrl'];
        } elseif (!empty($ss['globalBg']['imageUrl'])) {
            $ogImage = $ss['globalBg']['imageUrl'];
        }
        if (!empty($ss['faviconUrl'])) {
            $favicon = $ss['faviconUrl'];
        }
    }
}

$isHttps = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || (isset($_SERVER['SERVER_PORT']) && $_SERVER['SERVER_PORT'] == 443) || (!empty($_SERVER['HTTP_X_FORWARDED_PROTO']) && $_SERVER['HTTP_X_FORWARDED_PROTO'] === 'https');
$scheme  = $isHttps ? 'https' : 'http';
$host    = $_SERVER['HTTP_HOST'] ?? 'localhost';
$reqUri  = $_SERVER['REQUEST_URI'] ?? '/';
$fullUrl = $scheme . '://' . $host . $reqUri;

if ($ogImage && !preg_match('#^https?://#i', $ogImage)) {
    $ogImage = $scheme . '://' . $host . '/' . ltrim($ogImage, '/');
}
if (!$ogImage) {
    $ogImage = $scheme . '://' . $host . '/assets/logo.png';
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title><?php echo htmlspecialchars($siteTitle, ENT_QUOTES, 'UTF-8'); ?></title>
  <meta name="description" content="<?php echo htmlspecialchars($siteDesc, ENT_QUOTES, 'UTF-8'); ?>">

  <!-- OpenGraph / Social Sharing (WhatsApp, Facebook, Messenger, iMessage, LinkedIn) -->
  <meta property="og:type" content="website">
  <meta property="og:title" content="<?php echo htmlspecialchars($siteTitle, ENT_QUOTES, 'UTF-8'); ?>">
  <meta property="og:description" content="<?php echo htmlspecialchars($siteDesc, ENT_QUOTES, 'UTF-8'); ?>">
  <meta property="og:url" content="<?php echo htmlspecialchars($fullUrl, ENT_QUOTES, 'UTF-8'); ?>">
  <meta property="og:image" content="<?php echo htmlspecialchars($ogImage, ENT_QUOTES, 'UTF-8'); ?>">
  <meta property="og:image:alt" content="<?php echo htmlspecialchars($siteTitle, ENT_QUOTES, 'UTF-8'); ?>">

  <!-- Twitter / X Card -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="<?php echo htmlspecialchars($siteTitle, ENT_QUOTES, 'UTF-8'); ?>">
  <meta name="twitter:description" content="<?php echo htmlspecialchars($siteDesc, ENT_QUOTES, 'UTF-8'); ?>">
  <meta name="twitter:image" content="<?php echo htmlspecialchars($ogImage, ENT_QUOTES, 'UTF-8'); ?>">

  <!-- Favicon & Icons -->
  <link rel="icon" type="image/png" href="<?php echo htmlspecialchars($favicon, ENT_QUOTES, 'UTF-8'); ?>">
  <link rel="shortcut icon" href="<?php echo htmlspecialchars($favicon, ENT_QUOTES, 'UTF-8'); ?>">

  <!-- Typography & Google Fonts Pre-fetch -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=Outfit:wght@400;500;600;700;800&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">

  <!-- Core Design System & Component Styles -->
  <link rel="stylesheet" href="css/design-system.css?v=<?php echo filemtime(__DIR__.'/css/design-system.css'); ?>">
  <link rel="stylesheet" href="css/animations.css?v=<?php echo filemtime(__DIR__.'/css/animations.css'); ?>">
  <link rel="stylesheet" href="css/widgets.css?v=<?php echo filemtime(__DIR__.'/css/widgets.css'); ?>">
  <link rel="stylesheet" href="css/builder.css?v=<?php echo filemtime(__DIR__.'/css/builder.css'); ?>">

  <!-- Argon2 WebAssembly Engine (Local copy with dynamic fallback) -->
  <script src="js/vendor/argon2.umd.min.js"></script>
  <script src="js/vendor/qrcode.min.js"></script>
  <script>
    if (!window.hashwasm || !window.hashwasm.argon2id) {
      var s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/hash-wasm@4/dist/argon2.umd.min.js';
      document.head.appendChild(s);
    }
  </script>
  <!-- Synchronously check pre-loader configuration before <body> parses to avoid any black screen flash -->
  <script>
    (function() {
      try {
        var raw = localStorage.getItem('aether_site_loader_config');
        var cfg = null;
        if (raw) {
          cfg = JSON.parse(raw);
        } else {
          var draft = localStorage.getItem('aether_builder_draft_v2') || localStorage.getItem('aether_public_site_v2');
          if (draft) {
            var d = JSON.parse(draft);
            var ss = d && d.siteSettings ? d.siteSettings : null;
            if (ss) {
              cfg = {
                enabled: ss.loaderEnabled !== false && (ss.loader ? ss.loader.enabled !== false : true),
                caption: ss.loaderCaption !== undefined ? ss.loaderCaption : (ss.loader && ss.loader.caption !== undefined ? ss.loader.caption : (ss.siteName ? 'Loading ' + ss.siteName + '...' : 'Loading...')),
                subcaption: ss.loaderSubcaption !== undefined ? ss.loaderSubcaption : (ss.loader && ss.loader.subcaption !== undefined ? ss.loader.subcaption : 'Initializing modules & layout engine'),
                showSubcaption: ss.loaderShowSubcaption !== false && (ss.loader ? ss.loader.showSubcaption !== false : true)
              };
            }
          }
        }
        window.__AETHER_LOADER_CFG = cfg;
        // If splash screen is disabled: inject instant-hide style so browser NEVER paints the black screen or spinner overlay
        if (cfg && cfg.enabled === false) {
          var s = document.createElement('style');
          s.id = 'aether-loader-instant-hide';
          s.textContent = '#aether-initial-loader { display: none !important; }';
          document.head.appendChild(s);
        }
        // If subcaption is unchecked: inject style so "Initializing modules & layout engine" never flashes or animates
        if (cfg && (cfg.showSubcaption === false || cfg.subcaption === false || cfg.subcaption === '')) {
          var subS = document.createElement('style');
          subS.id = 'aether-subcaption-instant-hide';
          subS.textContent = '#aether-loader-subcaption { display: none !important; }';
          document.head.appendChild(subS);
        }
      } catch(e) {}
    })();
  </script>
</head>
<body>
  <!-- Initial Loading Shell (Dismissed automatically when app renders; completely bypassed when splash screen is disabled) -->
  <div id="aether-initial-loader" style="position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#090d16;color:#e2e8f0;font-family:'Plus Jakarta Sans',sans-serif;z-index:999;transition:opacity 0.2s ease;">
    <div style="width:40px;height:40px;border:3px solid rgba(99,102,241,0.2);border-top-color:#6366f1;border-radius:50%;animation:aether-spin 0.8s linear infinite;margin-bottom:16px;"></div>
    <div id="aether-loader-caption" style="font-size:0.95rem;font-weight:600;letter-spacing:0.02em;">Loading...</div>
    <div id="aether-loader-subcaption" style="font-size:0.75rem;color:#94a3b8;margin-top:4px;">Initializing modules & layout engine</div>
    <style>@keyframes aether-spin{to{transform:rotate(360deg)}}</style>
  </div>
  <script>
    (function() {
      try {
        var cfg = window.__AETHER_LOADER_CFG;
        var loaderEl = document.getElementById('aether-initial-loader');
        if (cfg && cfg.enabled === false) {
          if (loaderEl) {
            loaderEl.style.display = 'none';
            try { loaderEl.remove(); } catch(e){}
          }
          return;
        }
        var cap = document.getElementById('aether-loader-caption');
        var sub = document.getElementById('aether-loader-subcaption');
        if (cfg) {
          if (cap) {
            if (cfg.caption === false || cfg.caption === '') {
              cap.style.display = 'none';
            } else {
              cap.textContent = cfg.caption;
            }
          }
          if (sub) {
            if (cfg.showSubcaption === false || cfg.subcaption === false || cfg.subcaption === '') {
              sub.style.display = 'none';
            } else {
              sub.textContent = cfg.subcaption;
            }
          }
        }
      } catch(e) {}
    })();

    // Failsafe auto-dismiss: ensure loader never blocks screen if app takes time or finishes
    if (!window.__AETHER_LOADER_CFG || window.__AETHER_LOADER_CFG.enabled !== false) {
      setTimeout(function() {
        var l = document.getElementById('aether-initial-loader');
        if (l) {
          l.style.opacity = '0';
          l.style.pointerEvents = 'none';
          l.style.display = 'none';
          try { l.remove(); } catch(e){}
        }
      }, 400);
    }
  </script>

  <noscript>
    <div style="padding: 40px; text-align: center; color: #fff; background: #0b0f19;">
      <h2>JavaScript Required</h2>
      <p>AetherBuilder requires JavaScript to render the visual canvas.</p>
    </div>
  </noscript>

  <!-- Main ES Module Bootstrap -->
  <script type="module" src="js/app.js?v=<?php echo filemtime(__DIR__.'/js/app.js'); ?>"></script>
</body>
</html>
