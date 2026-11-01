const fs = require('fs');
const path = require('path');

const apiPath = 'C:\\Users\\U S E R - P C\\.gemini\\antigravity-ide\\scratch\\elementor-builder\\api.php';
let code = fs.readFileSync(apiPath, 'utf8');

// 1. Add AETHER_VERSION and BACKUPS_DIR in Path Setup
const oldPathSetup = `// ── Path Setup ────────────────────────────────────────────────────────────────
define('ROOT',        rtrim(__DIR__, '/\\\\'));
define('DATA_DIR',    ROOT . '/data');
define('UPLOADS_DIR', ROOT . '/assets/uploads');
define('MAX_SUBS',    1000);
define('MAX_REVS',    20);

$ALLOWED_EXT = ['jpg','jpeg','png','gif','webp','svg','mp4','webm','pdf','json'];

// Ensure required directories exist
foreach ([DATA_DIR, UPLOADS_DIR] as $dir) {
    if (!is_dir($dir)) {
        @mkdir($dir, 0755, true);
    }
}`;

const newPathSetup = `// ── Path Setup ────────────────────────────────────────────────────────────────
define('AETHER_VERSION', '2.5.0');
define('ROOT',        rtrim(__DIR__, '/\\\\'));
define('DATA_DIR',    ROOT . '/data');
define('UPLOADS_DIR', ROOT . '/assets/uploads');
define('BACKUPS_DIR', DATA_DIR . '/backups');
define('MAX_SUBS',    1000);
define('MAX_REVS',    20);

$ALLOWED_EXT = ['jpg','jpeg','png','gif','webp','svg','mp4','webm','pdf','json','zip'];

// Ensure required directories exist
foreach ([DATA_DIR, UPLOADS_DIR, BACKUPS_DIR] as $dir) {
    if (!is_dir($dir)) {
        @mkdir($dir, 0755, true);
    }
}`;

if (code.includes(oldPathSetup)) {
  code = code.replace(oldPathSetup, newPathSetup);
  console.log('Path setup updated.');
} else {
  console.log('Could not find oldPathSetup, checking if already updated...');
}

// 2. Add perform_core_update helper function before routes
const updateHelper = `
function perform_core_update($zipFilePath, $createBackup = true) {
    if (!class_exists('ZipArchive')) {
        return ['success' => false, 'error' => 'PHP ZipArchive extension is not enabled on this server.'];
    }

    $backupFile = null;
    if ($createBackup) {
        $backupName = 'backup_v' . AETHER_VERSION . '_' . date('Ymd_His') . '.zip';
        $backupPath = BACKUPS_DIR . '/' . $backupName;
        $zipBackup = new ZipArchive();
        if ($zipBackup->open($backupPath, ZipArchive::CREATE | ZipArchive::OVERWRITE) === true) {
            $filesToBackup = ['index.html', 'api.php', 'version.json', 'favicon.png', 'favicon.ico'];
            foreach ($filesToBackup as $bf) {
                if (file_exists(ROOT . '/' . $bf)) {
                    $zipBackup->addFile(ROOT . '/' . $bf, $bf);
                }
            }
            foreach (['js', 'css'] as $dirName) {
                $dirPath = ROOT . '/' . $dirName;
                if (is_dir($dirPath)) {
                    $it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dirPath, RecursiveDirectoryIterator::SKIP_DOTS));
                    foreach ($it as $f) {
                        $sub = substr($f->getPathname(), strlen(ROOT) + 1);
                        $sub = str_replace('\\\\', '/', $sub);
                        $zipBackup->addFile($f->getPathname(), $sub);
                    }
                }
            }
            $zipBackup->close();
            $backupFile = $backupName;
        }
    }

    $zip = new ZipArchive();
    $res = $zip->open($zipFilePath);
    if ($res !== true) {
        @unlink($zipFilePath);
        return ['success' => false, 'error' => 'Could not open ZIP package (Code: ' . $res . ')'];
    }

    // Check if files are nested inside a root folder (e.g. elementor-builder/ or elementor-builder-deploy/)
    $prefixToRemove = '';
    for ($i = 0; $i < $zip->numFiles; $i++) {
        $entry = $zip->getNameIndex($i);
        if (preg_match('#^([^/]+)/(index\\.html|api\\.php|js/app\\.js)$#', $entry, $m)) {
            $prefixToRemove = $m[1] . '/';
            break;
        }
    }

    $extracted = 0;
    $skipped = 0;
    $updatedFiles = [];

    for ($i = 0; $i < $zip->numFiles; $i++) {
        $entryName = $zip->getNameIndex($i);
        $entryName = str_replace('\\\\', '/', $entryName);

        if ($prefixToRemove && strpos($entryName, $prefixToRemove) === 0) {
            $rel = substr($entryName, strlen($prefixToRemove));
        } else {
            $rel = $entryName;
        }

        $rel = trim($rel, '/');
        if ($rel === '' || substr($rel, -1) === '/') continue;
        if (strpos($rel, '..') !== false) continue;

        // PROTECTED PATHS: Never overwrite user data, uploads, backups, or system config
        if (strpos($rel, 'data/') === 0 || 
            strpos($rel, 'assets/uploads/') === 0 || 
            strpos($rel, '.git') === 0 || 
            strpos($rel, '__MACOSX') === 0 || 
            basename($rel) === '.htaccess' || 
            basename($rel) === '.DS_Store') {
            $skipped++;
            continue;
        }

        $dest = ROOT . '/' . $rel;
        $dir = dirname($dest);
        if (!is_dir($dir)) {
            @mkdir($dir, 0755, true);
        }

        $stream = $zip->getStream($entryName);
        if ($stream) {
            $out = fopen($dest, 'wb');
            if ($out) {
                stream_copy_to_stream($stream, $out);
                fclose($out);
                $extracted++;
                $updatedFiles[] = $rel;
            }
            fclose($stream);
        }
    }

    $zip->close();
    @unlink($zipFilePath);

    return [
        'success'         => true,
        'extracted_count' => $extracted,
        'skipped_count'   => $skipped,
        'updated_files'   => $updatedFiles,
        'backup'          => $backupFile,
        'message'         => "Successfully updated {$extracted} core files without touching your pages, media, or settings."
    ];
}
`;

const routeMarker = '// ── Route ─────────────────────────────────────────────────────────────────────';
if (code.includes(routeMarker) && !code.includes('perform_core_update')) {
  code = code.replace(routeMarker, updateHelper + '\n' + routeMarker);
  console.log('Update helper added.');
}

// 3. Add update endpoints before Fallback
const updateEndpoints = `
// ── GET: get_system_info ──────────────────────────────────────────────────────
if ($action === 'get_system_info' && $method === 'GET') {
    send_json(200, [
        'success'         => true,
        'version'         => AETHER_VERSION,
        'php_version'     => PHP_VERSION,
        'zip_supported'   => class_exists('ZipArchive'),
        'root_writable'   => is_writable(ROOT),
        'data_writable'   => is_writable(DATA_DIR),
        'server_software' => $_SERVER['SERVER_SOFTWARE'] ?? 'PHP Web Server'
    ]);
}

// ── GET: list_backups ─────────────────────────────────────────────────────────
if ($action === 'list_backups' && $method === 'GET') {
    $backups = [];
    if (is_dir(BACKUPS_DIR)) {
        foreach (scandir(BACKUPS_DIR) as $f) {
            if ($f === '.' || $f === '..' || substr($f, -4) !== '.zip') continue;
            $stat = stat(BACKUPS_DIR . '/' . $f);
            $backups[] = [
                'filename' => $f,
                'size'     => $stat['size'],
                'date'     => date('Y-m-d H:i:s', $stat['mtime'])
            ];
        }
        usort($backups, function($a, $b) { return strcmp($b['date'], $a['date']); });
    }
    send_json(200, ['success' => true, 'backups' => $backups]);
}

// ── POST: apply_update ────────────────────────────────────────────────────────
if ($action === 'apply_update' && $method === 'POST') {
    $body = @json_decode(get_request_body(), true);
    $url  = $body['download_url'] ?? '';
    $createBackup = isset($body['backup']) ? (bool)$body['backup'] : true;

    if (empty($url)) {
        send_json(400, ['success' => false, 'error' => 'Missing download_url in request.']);
    }

    $tempZip = DATA_DIR . '/temp_update_' . time() . '.zip';
    $downloaded = false;

    // Try cURL first if available
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
        if ($res && $httpCode >= 200 && $httpCode < 400 && file_exists($tempZip) && filesize($tempZip) > 1000) {
            $downloaded = true;
        }
    }

    // Fallback: try file_get_contents with stream context
    if (!$downloaded) {
        $ctx = stream_context_create([
            'http' => ['timeout' => 120, 'user_agent' => 'AetherBuilder-Updater/' . AETHER_VERSION],
            'ssl'  => ['verify_peer' => false, 'verify_peer_name' => false]
        ]);
        $data = @file_get_contents($url, false, $ctx);
        if ($data !== false && strlen($data) > 1000) {
            @file_put_contents($tempZip, $data);
            $downloaded = true;
        }
    }

    if (!$downloaded || !file_exists($tempZip) || filesize($tempZip) < 1000) {
        @unlink($tempZip);
        send_json(500, [
            'success' => false,
            'error'   => 'Could not download update package directly from remote server. Your hosting provider may block outgoing HTTP downloads. Please use the "Manual ZIP Upload" option in the Update Center!'
        ]);
    }

    $result = perform_core_update($tempZip, $createBackup);
    send_json($result['success'] ? 200 : 500, $result);
}

// ── POST: upload_update_zip ───────────────────────────────────────────────────
if ($action === 'upload_update_zip' && $method === 'POST') {
    if (empty($_FILES['update_zip'])) {
        send_json(400, ['success' => false, 'error' => 'No zip file received. Field name must be "update_zip".']);
    }

    $file = $_FILES['update_zip'];
    if ($file['error'] !== UPLOAD_ERR_OK) {
        send_json(500, ['success' => false, 'error' => 'File upload error code: ' . $file['error']]);
    }

    $tempZip = DATA_DIR . '/temp_update_' . time() . '.zip';
    if (!move_uploaded_file($file['tmp_name'], $tempZip)) {
        send_json(500, ['success' => false, 'error' => 'Failed to save uploaded zip package on server. Check folder permissions.']);
    }

    $createBackup = isset($_POST['backup']) ? ($_POST['backup'] === '1' || $_POST['backup'] === 'true') : true;
    $result = perform_core_update($tempZip, $createBackup);
    send_json($result['success'] ? 200 : 500, $result);
}
`;

const fallbackMarker = '// ── Fallback: unknown action ──────────────────────────────────────────────────';
if (code.includes(fallbackMarker) && !code.includes('upload_update_zip')) {
  code = code.replace(fallbackMarker, updateEndpoints + '\n' + fallbackMarker);
  console.log('Update endpoints added.');
}

fs.writeFileSync(apiPath, code, 'utf8');
console.log('api.php successfully written!');

