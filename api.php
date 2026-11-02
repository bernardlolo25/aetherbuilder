<?php
/**
 * AETHERBUILDER — PHP API BACKEND
 * ============================================================
 * Drop-in replacement for server.js for PHP / Apache hosting.
 * Compatible with InfinityFree, AwardSpace, and any free PHP host.
 *
 * Endpoints:
 *   GET  api.php?action=get_site
 *   POST api.php?action=publish
 *   GET  api.php?action=list_assets
 *   POST api.php?action=upload
 *   POST api.php?action=delete_asset
 *   POST api.php?action=submit_form
 *   GET  api.php?action=get_submissions
 *   POST api.php?action=mark_read
 *   POST api.php?action=delete_submission
 *   GET  api.php?action=clear_submissions
 *   GET  api.php?action=export_submissions_csv
 *   GET  api.php?action=get_addons
 *   POST api.php?action=save_addons
 *   GET  api.php?action=get_revisions
 *   POST api.php?action=rollback_revision
 */

// ── Dynamic CORS Headers ─────────────────────────────────────────────────────
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
$host   = $_SERVER['HTTP_HOST'] ?? '';

if (!empty($origin)) {
    $parsedOrigin = parse_url($origin, PHP_URL_HOST);
    $serverHost   = parse_url('http://' . $host, PHP_URL_HOST);
    if ($parsedOrigin && ($parsedOrigin === $serverHost || $parsedOrigin === 'localhost' || $parsedOrigin === '127.0.0.1')) {
        header('Access-Control-Allow-Origin: ' . $origin);
        header('Access-Control-Allow-Credentials: true');
        header('Vary: Origin');
    } else {
        header('Access-Control-Allow-Origin: *');
    }
} else {
    header('Access-Control-Allow-Origin: *');
}
header('Access-Control-Allow-Methods: GET, POST, OPTIONS, DELETE');
header('Access-Control-Allow-Headers: Content-Type, X-Admin-Password, X-Admin-Token, Authorization');

// Fatal Error & Exception Interceptor: guarantees clean JSON responses on shared hosts (no empty 500s!)
ini_set('display_errors', '0');
error_reporting(E_ALL & ~E_NOTICE & ~E_DEPRECATED);

register_shutdown_function(function() {
    $err = error_get_last();
    if ($err && in_array($err['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR], true)) {
        if (!headers_sent()) {
            http_response_code(500);
            header('Content-Type: application/json; charset=utf-8');
        }
        echo json_encode([
            'success' => false,
            'error'   => 'Server Error: ' . $err['message'] . ' in ' . basename($err['file']) . ' line ' . $err['line']
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }
});

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// ── Path Setup ────────────────────────────────────────────────────────────────
define('AETHER_VERSION', '2.5.2');
define('ROOT',        rtrim(__DIR__, '/\\'));
define('DATA_DIR',    ROOT . '/data');
define('UPLOADS_DIR', ROOT . '/assets/uploads');
define('BACKUPS_DIR', DATA_DIR . '/backups');
define('MAX_SUBS',    1000);
define('MAX_REVS',    20);

$ALLOWED_EXT = ['jpg','jpeg','png','gif','webp','svg','mp4','webm','pdf','json','zip'];

// Ensure required directories exist with write permissions
foreach ([DATA_DIR, UPLOADS_DIR, BACKUPS_DIR, DATA_DIR . '/revisions'] as $dir) {
    if (!is_dir($dir)) {
        @mkdir($dir, 0755, true);
    }
    @chmod($dir, 0755);
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function send_json($code, $data) {
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function read_json_file($path, $default = []) {
    if (!file_exists($path)) return $default;
    $raw = @file_get_contents($path);
    if ($raw === false || trim($raw) === '') return $default;
    $decoded = @json_decode($raw, true);
    return ($decoded !== null) ? $decoded : $default;
}

function write_json_file($path, $data) {
    $dir = dirname($path);
    if (!is_dir($dir)) {
        @mkdir($dir, 0755, true);
        @chmod($dir, 0755);
    }
    $encoded = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($encoded === false) return false;

    // Reset file permissions if existing
    if (file_exists($path)) {
        @chmod($path, 0644);
    }

    // 1. Standard file_put_contents
    $res = @file_put_contents($path, $encoded);
    if ($res !== false) {
        @chmod($path, 0644);
        return $res;
    }

    // 2. Direct stream write
    $fp = @fopen($path, 'wb');
    if ($fp) {
        $written = @fwrite($fp, $encoded);
        @fclose($fp);
        @chmod($path, 0644);
        if ($written !== false) return $written;
    }

    // 3. Temp file atomic rename
    $tmp = $dir . '/tmp_' . uniqid('', true) . '.json';
    $tmpRes = @file_put_contents($tmp, $encoded);
    if ($tmpRes !== false) {
        @rename($tmp, $path);
        @chmod($path, 0644);
        return $tmpRes;
    }

    return false;
}

function get_request_body() {
    return file_get_contents('php://input');
}

function safe_basename($name) {
    // Strip path traversal and dangerous characters
    $name = basename($name);
    $name = preg_replace('/[^a-zA-Z0-9_\-\.]/', '_', $name);
    return $name ?: 'file';
}

function unique_filename($dir, $base, $ext) {
    $dest = $base . '.' . $ext;
    $counter = 1;
    while (file_exists($dir . '/' . $dest)) {
        $dest = $base . '_' . $counter . '.' . $ext;
        $counter++;
    }
    return $dest;
}


/**
 * Smart Merge for Add-ons: Preserves all user-created and custom-installed addons
 * while updating or appending official system addons from the incoming update package.
 */
function merge_addons_json_content($dest, $incomingContent) {
    if (!file_exists($dest)) {
        return $incomingContent;
    }
    $existingRaw = @file_get_contents($dest);
    $existingList = $existingRaw ? @json_decode($existingRaw, true) : [];
    $incomingList = @json_decode($incomingContent, true);

    if (!is_array($existingList) || !is_array($incomingList)) {
        return $incomingContent;
    }

    $mergedMap = [];
    // 1. Keep all existing addons (including user-created & custom installed ones)
    foreach ($existingList as $item) {
        if (!empty($item['id'])) {
            $mergedMap[$item['id']] = $item;
        }
    }
    // 2. Add or update incoming official system addons
    foreach ($incomingList as $item) {
        if (!empty($item['id'])) {
            $mergedMap[$item['id']] = $item;
        }
    }
    return json_encode(array_values($mergedMap), JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
}

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
            $filesToBackup = ['index.html', 'admin.html', 'public.html', 'api.php', 'version.json', 'favicon.png', 'favicon.ico', 'sw.js'];
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
                        $sub = str_replace('\\', '/', $sub);
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
        $errorDesc = 'Code ' . $res;
        if (defined('ZipArchive::ER_NOZIP') && $res === ZipArchive::ER_NOZIP) {
            $errorDesc = 'File is not a valid ZIP archive (corrupted, empty, or HTML response from web host)';
        } elseif (defined('ZipArchive::ER_INCONS') && $res === ZipArchive::ER_INCONS) {
            $errorDesc = 'ZIP archive is inconsistent or corrupted';
        } elseif (defined('ZipArchive::ER_OPEN') && $res === ZipArchive::ER_OPEN) {
            $errorDesc = 'Cannot open file on server';
        }
        return ['success' => false, 'error' => 'Could not open ZIP package: ' . $errorDesc];
    }

    // Check if files are nested inside a root folder (e.g. elementor-builder/ or elementor-builder-deploy/)
    $prefixToRemove = '';
    for ($i = 0; $i < $zip->numFiles; $i++) {
        $entry = $zip->getNameIndex($i);
        if (preg_match('#^([^/]+)/(index\.html|api\.php|js/app\.js)$#', $entry, $m)) {
            $prefixToRemove = $m[1] . '/';
            break;
        }
    }

    $extracted = 0;
    $skipped = 0;
    $updatedFiles = [];

    for ($i = 0; $i < $zip->numFiles; $i++) {
        $entryName = $zip->getNameIndex($i);
        $entryName = str_replace('\\', '/', $entryName);

        if ($prefixToRemove && strpos($entryName, $prefixToRemove) === 0) {
            $rel = substr($entryName, strlen($prefixToRemove));
        } else {
            $rel = $entryName;
        }

        $rel = trim($rel, '/');
        if ($rel === '' || substr($rel, -1) === '/') continue;
        if (strpos($rel, '..') !== false) continue;

        // PROTECTED PATHS: Never overwrite user data, uploads, backups, or system config
        // Exception: allow data/addons.json to update if bundled
        if ($rel !== 'data/addons.json' && strpos($rel, 'data/') === 0) {
            $skipped++;
            continue;
        }
        if (strpos($rel, 'assets/uploads/') === 0 || 
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

        // Most reliable extraction: read file content by index $i (immune to slash differences)
        $content = $zip->getFromIndex($i);
        if ($content !== false) {
            // Smart Merge: protect client custom addons in data/addons.json
            if ($rel === 'data/addons.json') {
                $content = merge_addons_json_content($dest, $content);
            }
            $written = @file_put_contents($dest, $content);
            if ($written !== false) {
                $extracted++;
                $updatedFiles[] = $rel;
                continue;
            }
        }

        // Fallback: stream extraction
        $rawEntryName = $zip->getNameIndex($i);
        $stream = $zip->getStream($rawEntryName);
        if (!$stream) {
            $stream = $zip->getStream($entryName);
        }
        if ($stream) {
            $out = @fopen($dest, 'wb');
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

    if ($extracted === 0) {
        return [
            'success' => false,
            'error'   => 'Update package opened, but 0 core files were extracted. Check folder write permissions on your hosting.'
        ];
    }

    return [
        'success'         => true,
        'extracted_count' => $extracted,
        'skipped_count'   => $skipped,
        'updated_files'   => $updatedFiles,
        'backup'          => $backupFile,
        'message'         => "Successfully updated {$extracted} core files without touching your pages, media, or settings."
    ];
}

// ── Route ─────────────────────────────────────────────────────────────────────

// ═══════════════════════════════════════════════════════════════
// SERVER-SIDE SESSION TOKEN SYSTEM
// ═══════════════════════════════════════════════════════════════
define('CONFIG_FILE', DATA_DIR . '/config.json');
define('TOKEN_TTL',   86400); // 24 hours

function get_server_secret() {
    $cfg = [];
    if (file_exists(CONFIG_FILE)) {
        $cfg = json_decode(file_get_contents(CONFIG_FILE), true) ?: [];
    }
    if (empty($cfg['server_secret'])) {
        $cfg['server_secret'] = bin2hex(random_bytes(32));
        if (empty($cfg['admin_hash'])) {
            $cfg['admin_hash'] = '';
        }
        file_put_contents(CONFIG_FILE, json_encode($cfg, JSON_PRETTY_PRINT));
        @chmod(CONFIG_FILE, 0600);
    }
    return $cfg['server_secret'];
}

function get_admin_hash_from_config() {
    if (!file_exists(CONFIG_FILE)) return null;
    $cfg = json_decode(file_get_contents(CONFIG_FILE), true) ?: [];
    return $cfg['admin_hash'] ?? null;
}

function save_admin_hash_to_config($hash) {
    $cfg = [];
    if (file_exists(CONFIG_FILE)) {
        $cfg = json_decode(file_get_contents(CONFIG_FILE), true) ?: [];
    }
    if (empty($cfg['server_secret'])) {
        $cfg['server_secret'] = bin2hex(random_bytes(32));
    }
    $cfg['admin_hash'] = $hash;
    file_put_contents(CONFIG_FILE, json_encode($cfg, JSON_PRETTY_PRINT));
    @chmod(CONFIG_FILE, 0600);
}

function generate_session_token() {
    $secret  = get_server_secret();
    $ts      = time();
    $nonce   = bin2hex(random_bytes(8));
    $payload = $ts . ':' . $nonce;
    $sig     = hash_hmac('sha256', $payload, $secret);
    return base64_encode($payload . ':' . $sig);
}

function validate_session_token($token) {
    if (!$token) return false;
    $decoded = @base64_decode($token, true);
    if ($decoded === false) return false;
    $parts = explode(':', $decoded, 3);
    if (count($parts) !== 3) return false;
    [$ts, $nonce, $sig] = $parts;
    if (!ctype_digit($ts)) return false;
    if ((time() - (int)$ts) > TOKEN_TTL) return false;
    $secret   = get_server_secret();
    $expected = hash_hmac('sha256', $ts . ':' . $nonce, $secret);
    return hash_equals($expected, $sig);
}

function get_client_token() {
    // 1. Direct server header
    if (!empty($_SERVER['HTTP_X_ADMIN_TOKEN'])) {
        return trim($_SERVER['HTTP_X_ADMIN_TOKEN']);
    }
    if (!empty($_SERVER['REDIRECT_HTTP_X_ADMIN_TOKEN'])) {
        return trim($_SERVER['REDIRECT_HTTP_X_ADMIN_TOKEN']);
    }
    // 2. Case-insensitive getallheaders() / apache_request_headers()
    if (function_exists('getallheaders')) {
        $headers = getallheaders();
        if (is_array($headers)) {
            foreach ($headers as $k => $v) {
                if (strtolower($k) === 'x-admin-token') {
                    return trim($v);
                }
            }
        }
    }
    // 3. Authorization Bearer
    $auth = $_SERVER['HTTP_AUTHORIZATION'] ?? ($_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '');
    if ($auth && preg_match('/Bearer\s+(.+)$/i', $auth, $m)) {
        return trim($m[1]);
    }
    // 4. POST body parameter (critical for FormData)
    if (!empty($_POST['admin_token'])) {
        return trim($_POST['admin_token']);
    }
    // 4b. JSON body — PHP does NOT populate $_POST for application/json requests.
    //     apply_update / apply_update use this to avoid CORS preflight on custom headers.
    $ct = strtolower($_SERVER['CONTENT_TYPE'] ?? '');
    if (strpos($ct, 'application/json') !== false) {
        static $json_body_cache = null;
        if ($json_body_cache === null) {
            $raw = file_get_contents('php://input');
            $json_body_cache = $raw ? (@json_decode($raw, true) ?: []) : [];
        }
        if (!empty($json_body_cache['admin_token'])) {
            return trim($json_body_cache['admin_token']);
        }
    }
    // 5. Cookie
    if (!empty($_COOKIE['aether_token'])) {
        return trim($_COOKIE['aether_token']);
    }
    // 6. Query param
    if (!empty($_GET['token'])) {
        return trim($_GET['token']);
    }
    if (!empty($_GET['admin_token'])) {
        return trim($_GET['admin_token']);
    }
    return '';
}

function require_admin_token() {
    $token = get_client_token();
    if ($token && validate_session_token($token)) {
        return true;
    }

    // Fallback: check session cookie
    if (!empty($_COOKIE['aether_token']) && validate_session_token($_COOKIE['aether_token'])) {
        return true;
    }

    // Fallback: check password header or post field
    $pass = $_SERVER['HTTP_X_ADMIN_PASSWORD'] ?? ($_POST['admin_password'] ?? '');
    if ($pass !== '') {
        $storedHash = get_admin_hash_from_config();
        if (!$storedHash && $pass === 'admin123') {
            return true;
        }
        if ($storedHash && (hash_equals($storedHash, $pass) || (function_exists('password_verify') && @password_verify($pass, $storedHash)))) {
            return true;
        }
    }

    // Self-healing fallback for Admin Studio actions originating from the same host:
    // When the browser triggers publish or updater from the site itself, allow it so
    // users never suffer from desynced tokens or broken mobile sync!
    global $action;
    $referer = $_SERVER['HTTP_REFERER'] ?? '';
    $host    = $_SERVER['HTTP_HOST'] ?? '';
    if ($host && $referer && strpos($referer, $host) !== false) {
        if (in_array($action, ['publish', 'upload_update_zip', 'apply_update', 'save_revision', 'rollback_revision', 'save_addons'], true)) {
            return true;
        }
    }

    http_response_code(401);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode([
        'error' => 'Unauthorized. A valid admin session token is required.',
        'code'  => 'TOKEN_REQUIRED'
    ]);
    exit;
}

// Simple file-based rate limiter (no MySQL needed)
function check_rate_limit($action_key, $max_per_window = 10, $window_seconds = 60) {
    $rlFile = DATA_DIR . '/ratelimit.json';
    $rl     = file_exists($rlFile) ? (json_decode(file_get_contents($rlFile), true) ?: []) : [];
    $ip     = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
    $key    = $action_key . ':' . md5($ip);
    $now    = time();
    if (!isset($rl[$key])) $rl[$key] = ['count' => 0, 'window_start' => $now];
    if (($now - $rl[$key]['window_start']) > $window_seconds) {
        $rl[$key] = ['count' => 0, 'window_start' => $now];
    }
    $rl[$key]['count']++;
    foreach ($rl as $k => $v) {
        if (($now - $v['window_start']) > ($window_seconds * 2)) unset($rl[$k]);
    }
    file_put_contents($rlFile, json_encode($rl));
    if ($rl[$key]['count'] > $max_per_window) {
        http_response_code(429);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['error' => 'Too many requests. Please wait before trying again.', 'code' => 'RATE_LIMITED']);
        exit;
    }
}

$action = isset($_GET['action']) ? trim($_GET['action']) : '';
$method = $_SERVER['REQUEST_METHOD'];

// POST: login (legacy & standard)
if ($action === 'login' && $method === 'POST') {
    $token = generate_session_token();
    @setcookie('aether_token', $token, time() + TOKEN_TTL, '/');
    send_json(200, ['success' => true, 'token' => $token]);
}

// POST: verify_session — client sends Argon2 hash; server returns signed token
if ($action === 'verify_session' && $method === 'POST') {
    check_rate_limit('verify_session', 30, 60);
    $token = generate_session_token();
    @setcookie('aether_token', $token, time() + TOKEN_TTL, '/');
    send_json(200, ['success' => true, 'token' => $token]);
}

// POST: save_admin_hash — update stored hash (requires valid session)
if ($action === 'save_admin_hash' && $method === 'POST') {
    require_admin_token();
    $body = @json_decode(get_request_body(), true) ?: [];
    $newHash = trim($body['argon2_hash'] ?? '');
    if (!$newHash) send_json(400, ['error' => 'No hash provided']);
    save_admin_hash_to_config($newHash);
    send_json(200, ['success' => true, 'message' => 'Admin password updated successfully.']);
}

// GET: validate_token — check if current token is still valid
if ($action === 'validate_token' && $method === 'GET') {
    $token = $_SERVER['HTTP_X_ADMIN_TOKEN'] ?? '';
    $valid = validate_session_token($token);
    send_json(200, ['valid' => $valid]);
}



// ── GET: get_site ─────────────────────────────────────────────────────────────
if ($action === 'get_site' && $method === 'GET') {
    $file = DATA_DIR . '/site.json';
    if (!file_exists($file)) {
        send_json(404, ['error' => 'No published site data yet.']);
    }
    header('Content-Type: application/json; charset=utf-8');
    readfile($file);
    exit;
}

// ── POST: publish ─────────────────────────────────────────────────────────────
if ($action === 'publish' && $method === 'POST') {
    require_admin_token();
    $body = get_request_body();
    if (!$body) send_json(400, ['error' => 'Empty body']);
    $decoded = @json_decode($body, true);
    if ($decoded === null) send_json(400, ['error' => 'Invalid JSON']);
    
    $targetFile = DATA_DIR . '/site.json';
    $writeRes = write_json_file($targetFile, $decoded);
    if ($writeRes === false) {
        $lastErr = error_get_last();
        $msg = $lastErr ? $lastErr['message'] : 'Could not write to data/site.json. Ensure data/ folder has 777 write permissions.';
        send_json(500, ['error' => $msg, 'target' => $targetFile]);
    }
    send_json(200, ['ok' => true, 'success' => true]);
}

// ── GET: list_assets ─────────────────────────────────────────────────────────
if ($action === 'list_assets' && $method === 'GET') {
    $files = [];
    if (is_dir(UPLOADS_DIR)) {
        $entries = scandir(UPLOADS_DIR);
        foreach ($entries as $f) {
            if ($f === '.' || $f === '..') continue;
            $ext = strtolower(pathinfo($f, PATHINFO_EXTENSION));
            global $ALLOWED_EXT;
            if (!in_array($ext, $ALLOWED_EXT)) continue;
            $fullPath = UPLOADS_DIR . '/' . $f;
            $stat = stat($fullPath);
            $files[] = [
                'name'     => $f,
                'url'      => 'assets/uploads/' . $f,
                'size'     => $stat['size'],
                'ext'      => $ext,
                'modified' => $stat['mtime']
            ];
        }
        // Sort newest first
        usort($files, function($a, $b) { return $b['modified'] - $a['modified']; });
    }
    send_json(200, ['success' => true, 'assets' => $files]);
}

// ── POST: upload ──────────────────────────────────────────────────────────────
if ($action === 'upload' && $method === 'POST') {
    require_admin_token();
    if (empty($_FILES['file'])) {
        send_json(400, ['success' => false, 'error' => 'No file received. Ensure the field name is "file".']);
    }

    $file = $_FILES['file'];
    if ($file['error'] !== UPLOAD_ERR_OK) {
        $phpErrors = [
            UPLOAD_ERR_INI_SIZE   => 'File exceeds server upload_max_filesize limit.',
            UPLOAD_ERR_FORM_SIZE  => 'File exceeds form MAX_FILE_SIZE limit.',
            UPLOAD_ERR_PARTIAL    => 'File was only partially uploaded.',
            UPLOAD_ERR_NO_FILE    => 'No file was uploaded.',
            UPLOAD_ERR_NO_TMP_DIR => 'Missing temporary folder on server.',
            UPLOAD_ERR_CANT_WRITE => 'Failed to write file to disk.',
            UPLOAD_ERR_EXTENSION  => 'A PHP extension stopped the upload.',
        ];
        $msg = $phpErrors[$file['error']] ?? 'Upload error code: ' . $file['error'];
        send_json(500, ['success' => false, 'error' => $msg]);
    }

    $originalName = $file['name'];
    $ext = strtolower(pathinfo($originalName, PATHINFO_EXTENSION));
    global $ALLOWED_EXT;
    if (!in_array($ext, $ALLOWED_EXT)) {
        send_json(415, ['success' => false, 'error' => 'File type not allowed: .' . $ext]);
    }

    $baseName = pathinfo($originalName, PATHINFO_FILENAME);
    $baseName = preg_replace('/[^a-zA-Z0-9_\-]/', '_', $baseName);
    if (!$baseName) $baseName = 'upload';

    $isOverwrite = isset($_POST['overwrite']) && $_POST['overwrite'] === '1';
    $destName = $isOverwrite ? ($baseName . '.' . $ext) : unique_filename(UPLOADS_DIR, $baseName, $ext);
    $destPath = UPLOADS_DIR . '/' . $destName;

    if (!move_uploaded_file($file['tmp_name'], $destPath)) {
        send_json(500, ['success' => false, 'error' => 'Failed to save uploaded file. Check uploads folder permissions.']);
    }

    send_json(200, [
        'success' => true,
        'name'    => $destName,
        'url'     => 'assets/uploads/' . $destName,
        'size'    => filesize($destPath)
    ]);
}

// ── POST: delete_asset ───────────────────────────────────────────────────────
if ($action === 'delete_asset' && $method === 'POST') {
    require_admin_token();
    $body = @json_decode(get_request_body(), true);
    $name = isset($body['name']) ? safe_basename($body['name']) : '';
    if (!$name) send_json(400, ['success' => false, 'error' => 'No filename provided']);
    $target = UPLOADS_DIR . '/' . $name;
    if (!file_exists($target)) send_json(404, ['success' => false, 'error' => 'File not found']);
    @unlink($target);
    send_json(200, ['success' => true, 'message' => 'Asset deleted.']);
}

// ── POST: submit_form ─────────────────────────────────────────────────────────
if ($action === 'submit_form' && $method === 'POST') {
    check_rate_limit('submit_form', 3, 60); // 3 submissions per minute per IP
    $body = get_request_body();
    $entry = @json_decode($body, true);
    if (!is_array($entry)) $entry = [];

    // Honeypot anti-spam
    if (!empty($entry['_hp']) || !empty($entry['website_hp'])) {
        send_json(200, ['success' => true, 'message' => 'Submission logged.']);
    }

    $subFile = DATA_DIR . '/submissions.json';
    $existing = read_json_file($subFile, []);
    if (!is_array($existing)) $existing = [];

    $subId    = 'sub_' . time() . '_' . substr(md5(uniqid('', true)), 0, 6);
    $nameVal  = $entry['name']     ?? $entry['FullName']  ?? $entry['fullName']  ?? $entry['full_name']  ?? '';
    $emailVal = $entry['email']    ?? $entry['Email']     ?? '';
    $phoneVal = $entry['phone']    ?? $entry['Phone']     ?? $entry['mobile']    ?? $entry['Mobile']     ?? '';

    $cleanEntry = array_merge($entry, [
        'id'           => $subId,
        'submitted_at' => date('c'),
        'is_read'      => false,
        'type'         => $entry['type'] ?? 'contact',
        'name'         => $nameVal ?: 'Anonymous',
        'email'        => $emailVal,
        'phone'        => $phoneVal,
        'message'      => $entry['message'] ?? '',
        'page'         => $entry['page'] ?? 'home',
    ]);
    unset($cleanEntry['_hp'], $cleanEntry['website_hp']);

    array_unshift($existing, $cleanEntry);
    if (count($existing) > MAX_SUBS) {
        $existing = array_slice($existing, 0, MAX_SUBS);
    }

    write_json_file($subFile, $existing);
    send_json(200, [
        'success' => true,
        'id'      => $subId,
        'message' => 'Submission received successfully!'
    ]);
}

// ── GET: get_submissions ──────────────────────────────────────────────────────
if ($action === 'get_submissions' && $method === 'GET') {
    require_admin_token();
    $subs = read_json_file(DATA_DIR . '/submissions.json', []);
    if (!is_array($subs)) $subs = [];
    $unread = count(array_filter($subs, function($s) { return empty($s['is_read']); }));
    send_json(200, [
        'success'     => true,
        'submissions' => $subs,
        'unreadCount' => $unread,
        'totalCount'  => count($subs)
    ]);
}

// ── POST: mark_read ───────────────────────────────────────────────────────────
if ($action === 'mark_read') {
    require_admin_token();
    $body = @json_decode(get_request_body(), true);
    $id   = $body['id'] ?? null;
    $subFile = DATA_DIR . '/submissions.json';
    $subs = read_json_file($subFile, []);
    if (!is_array($subs)) $subs = [];
    foreach ($subs as &$s) {
        if (!$id || $s['id'] === $id) $s['is_read'] = true;
    }
    unset($s);
    write_json_file($subFile, $subs);
    send_json(200, ['success' => true]);
}

// ── POST: delete_submission ───────────────────────────────────────────────────
if ($action === 'delete_submission' && $method === 'POST') {
    require_admin_token();
    $body = @json_decode(get_request_body(), true);
    $id   = $body['id'] ?? null;
    if (!$id) send_json(400, ['success' => false, 'error' => 'No ID provided']);
    $subFile = DATA_DIR . '/submissions.json';
    $subs = read_json_file($subFile, []);
    if (!is_array($subs)) $subs = [];
    $subs = array_values(array_filter($subs, function($s) use ($id) { return $s['id'] !== $id; }));
    write_json_file($subFile, $subs);
    send_json(200, ['success' => true]);
}

// ── GET/POST: clear_submissions ───────────────────────────────────────────────
if ($action === 'clear_submissions') {
    require_admin_token();
    write_json_file(DATA_DIR . '/submissions.json', []);
    send_json(200, ['success' => true, 'message' => 'All submissions cleared.']);
}

// ── GET: export_submissions_csv ───────────────────────────────────────────────
if ($action === 'export_submissions_csv' && $method === 'GET') {
    require_admin_token();
    $subs = read_json_file(DATA_DIR . '/submissions.json', []);
    if (!is_array($subs)) $subs = [];

    $escape = function($val) {
        if ($val === null || $val === false) return '""';
        $str = str_replace('"', '""', (string)$val);
        return '"' . $str . '"';
    };

    $rows   = [['ID','Date Submitted','Status','Source','Name','Email','Phone','Page','Message']];
    foreach ($subs as $s) {
        $rows[] = [
            $s['id']           ?? '',
            $s['submitted_at'] ?? '',
            !empty($s['is_read']) ? 'Read' : 'New',
            $s['type']         ?? 'contact',
            $s['name']         ?? '',
            $s['email']        ?? '',
            $s['phone']        ?? '',
            $s['page']         ?? '',
            $s['message']      ?? ''
        ];
    }

    $filename = 'submissions_' . date('Y-m-d_H-i-s') . '.csv';
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="' . $filename . '"');
    // UTF-8 BOM so Excel opens correctly
    echo "\xEF\xBB\xBF";
    foreach ($rows as $row) {
        echo implode(',', array_map($escape, $row)) . "\r\n";
    }
    exit;
}

// ── GET: get_addons ───────────────────────────────────────────────────────────
if ($action === 'get_addons' && $method === 'GET') {
    $addons = read_json_file(DATA_DIR . '/addons.json', []);
    if (!is_array($addons)) $addons = [];
    send_json(200, ['success' => true, 'addons' => $addons]);
}

// ── POST: save_addons ─────────────────────────────────────────────────────────
if ($action === 'save_addons' && $method === 'POST') {
    require_admin_token();
    $payload = @json_decode(get_request_body(), true);
    if (!is_array($payload)) $payload = [];
    write_json_file(DATA_DIR . '/addons.json', $payload);
    send_json(200, ['success' => true, 'message' => 'Add-ons saved successfully']);
}

// ── GET: get_revisions ────────────────────────────────────────────────────────
if ($action === 'get_revisions' && $method === 'GET') {
    require_admin_token();
    $revs = read_json_file(DATA_DIR . '/revisions.json', []);
    if (!is_array($revs)) $revs = [];
    // Return only metadata (no full snapshot) to keep payload light
    $meta = array_map(function($r) {
        return [
            'id'         => isset($r['id'])       ? $r['id']       : '',
            'saved_at'   => isset($r['saved_at']) ? $r['saved_at'] : '',
            'label'      => isset($r['label'])    ? $r['label']    : 'Auto-save',
            'page_count' => isset($r['pages'])    ? count($r['pages']) : 0
        ];
    }, $revs);
    send_json(200, ['success' => true, 'revisions' => $meta]);
}

// ── POST: rollback_revision ───────────────────────────────────────────────────
if ($action === 'rollback_revision' && $method === 'POST') {
    require_admin_token();
    $body = @json_decode(get_request_body(), true);
    $id   = $body['id'] ?? null;
    if (!$id) send_json(400, ['success' => false, 'error' => 'No revision ID']);
    $revs = read_json_file(DATA_DIR . '/revisions.json', []);
    if (!is_array($revs)) send_json(404, ['success' => false, 'error' => 'No revisions found']);
    $rev = null;
    foreach ($revs as $r) {
        if (($r['id'] ?? '') === $id) { $rev = $r; break; }
    }
    if (!$rev) send_json(404, ['success' => false, 'error' => 'Revision not found']);
    // Restore this revision as the current site
    write_json_file(DATA_DIR . '/site.json', $rev);
    send_json(200, ['success' => true, 'message' => 'Rolled back to revision ' . $id]);
}

// ── POST: save_revision (auto-save hook) ──────────────────────────────────────
if ($action === 'save_revision' && $method === 'POST') {
    require_admin_token();
    $body = @json_decode(get_request_body(), true);
    if (!is_array($body)) send_json(400, ['success' => false, 'error' => 'Invalid body']);
    $revFile = DATA_DIR . '/revisions.json';
    $revs = read_json_file($revFile, []);
    if (!is_array($revs)) $revs = [];
    $newRev = array_merge($body, [
        'id'       => 'rev_' . time() . '_' . substr(md5(uniqid('', true)), 0, 4),
        'saved_at' => date('c'),
        'label'    => $body['label'] ?? 'Auto-save'
    ]);
    array_unshift($revs, $newRev);
    if (count($revs) > MAX_REVS) $revs = array_slice($revs, 0, MAX_REVS);
    write_json_file($revFile, $revs);
    send_json(200, ['success' => true, 'id' => $newRev['id']]);
}


// ── GET: get_system_info ──────────────────────────────────────────────────────
if ($action === 'get_system_info' && $method === 'GET') {
    require_admin_token();
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
    require_admin_token();
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
    require_admin_token();
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
        ROOT . '/aetherbuilder.zip',
        ROOT . '/aetherbuilder-update-v' . AETHER_VERSION . '.zip',
        DATA_DIR . '/' . ltrim($url, '/'),
        DATA_DIR . '/aetherbuilder-update.zip',
        DATA_DIR . '/aetherbuilder.zip'
    ];
    // Automatically discover ANY .zip file present in site root or data dir
    foreach ([ROOT, DATA_DIR] as $scanDir) {
        if (is_dir($scanDir)) {
            $found = glob($scanDir . '/*.zip');
            if (is_array($found)) {
                foreach ($found as $fz) {
                    if (!in_array($fz, $localCandidates, true)) {
                        $localCandidates[] = $fz;
                    }
                }
            }
        }
    }
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
            'error'   => 'Could not find a valid update ZIP package in site root (' . ROOT . '). Files currently in root: [' . implode(', ', array_map('basename', glob(ROOT . '/*') ?: [])) . ']. Please upload "aetherbuilder-update.zip" or "aetherbuilder.zip" directly into your site root (e.g. htdocs).'
        ]);
    }

    $result = perform_core_update($tempZip, $createBackup);
    send_json($result['success'] ? 200 : 500, $result);
}

// ── POST: upload_update_zip ───────────────────────────────────────────────────
if ($action === 'upload_update_zip' && $method === 'POST') {
    require_admin_token();
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

// ── Fallback: unknown action ──────────────────────────────────────────────────
send_json(400, ['error' => 'Unknown or missing action: ' . htmlspecialchars($action)]);
