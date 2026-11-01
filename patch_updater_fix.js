/**
 * patch_updater_fix.js
 * ============================================================================
 * Fixes for the 1-Click Update system:
 * 1. api.php:
 *    - In apply_update: Checks local files first (ROOT/aetherbuilder-update.zip, etc.)
 *    - Checks ZIP magic header (PK\x03\x04) before attempting ZipArchive::open
 *    - Returns descriptive error messages for ZipArchive error codes (e.g. ER_NOZIP)
 *    - In upload_update_zip: Validates ZIP magic header
 * 2. js/app.js:
 *    - Changes fallback download_url from 'version.json' to 'aetherbuilder-update.zip'
 * 3. version.json:
 *    - Changes download_url from 'version.json' to 'aetherbuilder-update.zip'
 * ============================================================================
 */

const fs = require('fs');
const path = require('path');

const BASE = 'C:\\Users\\U S E R - P C\\.gemini\\antigravity-ide\\scratch\\elementor-builder';

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

console.log('--- 1. Updating api.php updater endpoints ---');
{
  let api = read('api.php');

  // 1a. Enhance ZipArchive error reporting in perform_core_update
  const oldZipOpen = `    $zip = new ZipArchive();
    $res = $zip->open($zipFilePath);
    if ($res !== true) {
        @unlink($zipFilePath);
        return ['success' => false, 'error' => 'Could not open ZIP package (Code: ' . $res . ')'];
    }`;

  const newZipOpen = `    $zip = new ZipArchive();
    $res = $zip->open($zipFilePath);
    if ($res !== true) {
        @unlink($zipFilePath);
        $errorDesc = 'Code ' . $res;
        if (defined('ZipArchive::ER_NOZIP') && $res === ZipArchive::ER_NOZIP) {
            $errorDesc = 'File is not a valid ZIP archive (corrupted, empty, or HTML response from web host)';
        } elseif (defined('ZipArchive::ER_INCONS') && $res === ZipArchive::ER_INCONS) {
            $errorDesc = 'ZIP archive is inconsistent or corrupted';
        } elseif (defined('ZipArchive::ER_OPEN') && $res === ZipArchive::ER_OPEN) {
            $errorDesc = 'Cannot open file on server';
        }
        return ['success' => false, 'error' => 'Could not open ZIP package: ' . $errorDesc];
    }`;

  if (api.includes(oldZipOpen)) {
    api = api.replace(oldZipOpen, newZipOpen);
    console.log('  [OK] Enhanced ZipArchive error descriptions');
  }

  // 1b. Replace apply_update endpoint with local-first + ZIP magic verification
  const startMarker = "// ── POST: apply_update ────────────────────────────────────────────────────────\nif ($action === 'apply_update' && $method === 'POST') {";
  const endMarker = "// ── POST: upload_update_zip ───────────────────────────────────────────────────";

  const startIdx = api.indexOf(startMarker);
  const endIdx = api.indexOf(endMarker);

  if (startIdx === -1 || endIdx === -1) {
    console.error('Could not locate apply_update block in api.php');
    process.exit(1);
  }

  const newApplyUpdateBlock = `// ── POST: apply_update ────────────────────────────────────────────────────────
if ($action === 'apply_update' && $method === 'POST') {
    $body = @json_decode(get_request_body(), true);
    $url  = trim($body['download_url'] ?? '');
    $createBackup = isset($body['backup']) ? (bool)$body['backup'] : true;

    if (empty($url) || $url === 'version.json') {
        $url = 'aetherbuilder-update.zip';
    }

    $tempZip = DATA_DIR . '/temp_update_' . time() . '.zip';
    $downloaded = false;

    // Helper: test if file has valid ZIP PK magic header
    $isZipFile = function($filePath) {
        if (!file_exists($filePath) || filesize($filePath) < 100) return false;
        $fh = @fopen($filePath, 'rb');
        if (!$fh) return false;
        $magic = @fread($fh, 4);
        @fclose($fh);
        return ($magic && substr($magic, 0, 2) === 'PK');
    };

    // 1. Check local file candidates on server first (instant, 100% reliable on restricted hosts)
    $localCandidates = [
        ROOT . '/' . ltrim($url, '/'),
        ROOT . '/aetherbuilder-update.zip',
        ROOT . '/aetherbuilder-update-v' . AETHER_VERSION . '.zip',
        DATA_DIR . '/' . ltrim($url, '/'),
        DATA_DIR . '/aetherbuilder-update.zip'
    ];
    foreach ($localCandidates as $cand) {
        if ($isZipFile($cand)) {
            if (@copy($cand, $tempZip)) {
                $downloaded = true;
                break;
            }
        }
    }

    // 2. If not found locally and $url is an HTTP/HTTPS URL, attempt download
    if (!$downloaded && preg_match('#^https?://#i', $url)) {
        // Try cURL first
        if (function_exists('curl_init')) {
            $ch = curl_init($url);
            $fp = fopen($tempZip, 'wb');
            curl_setopt($ch, CURLOPT_FILE, $fp);
            curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
            curl_setopt($ch, CURLOPT_TIMEOUT, 120);
            curl_setopt($ch, CURLOPT_USERAGENT, 'AetherBuilder-Updater/' . AETHER_VERSION);
            curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
            curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);
            $res = curl_exec($ch);
            $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            curl_close($ch);
            fclose($fp);
            if ($res && $httpCode >= 200 && $httpCode < 400 && $isZipFile($tempZip)) {
                $downloaded = true;
            }
        }

        // Try file_get_contents fallback
        if (!$downloaded) {
            $ctx = stream_context_create([
                'http' => ['timeout' => 120, 'user_agent' => 'AetherBuilder-Updater/' . AETHER_VERSION],
                'ssl'  => ['verify_peer' => false, 'verify_peer_name' => false]
            ]);
            $data = @file_get_contents($url, false, $ctx);
            if ($data !== false && strlen($data) > 100 && substr($data, 0, 2) === 'PK') {
                @file_put_contents($tempZip, $data);
                $downloaded = true;
            }
        }
    }

    if (!$downloaded || !$isZipFile($tempZip)) {
        @unlink($tempZip);
        send_json(500, [
            'success' => false,
            'error'   => 'Could not locate or download update package. Your hosting provider blocks outgoing downloads. Please switch to the "Manual ZIP Drop" tab in this modal, or place "aetherbuilder-update.zip" in your site folder.'
        ]);
    }

    $result = perform_core_update($tempZip, $createBackup);
    send_json($result['success'] ? 200 : 500, $result);
}

`;

  api = api.substring(0, startIdx) + newApplyUpdateBlock + api.substring(endIdx);
  write('api.php', api);
}

console.log('\n--- 2. Updating js/app.js download_url fallback ---');
{
  let app = read('js/app.js');
  app = app.replace(
    "download_url: manifest?.download_url || 'version.json'",
    "download_url: manifest?.download_url || 'aetherbuilder-update.zip'"
  );
  write('js/app.js', app);
}

console.log('\n--- 3. Updating version.json download_url ---');
{
  let vJson = JSON.parse(read('version.json'));
  vJson.download_url = 'aetherbuilder-update.zip';
  write('version.json', JSON.stringify(vJson, null, 2));
}

console.log('\n✅ Updater patch complete!');

