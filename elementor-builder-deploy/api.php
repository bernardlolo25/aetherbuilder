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

// ── CORS Headers ─────────────────────────────────────────────────────────────
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS, DELETE');
header('Access-Control-Allow-Headers: Content-Type, X-Admin-Password');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// ── Path Setup ────────────────────────────────────────────────────────────────
define('ROOT',        rtrim(__DIR__, '/\\'));
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
    if (!is_dir($dir)) @mkdir($dir, 0755, true);
    return file_put_contents($path, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), LOCK_EX);
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

// ── Route ─────────────────────────────────────────────────────────────────────
$action = isset($_GET['action']) ? trim($_GET['action']) : '';
$method = $_SERVER['REQUEST_METHOD'];

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
    $body = get_request_body();
    if (!$body) send_json(400, ['error' => 'Empty body']);
    $decoded = @json_decode($body, true);
    if ($decoded === null) send_json(400, ['error' => 'Invalid JSON']);
    if (write_json_file(DATA_DIR . '/site.json', $decoded) === false) {
        send_json(500, ['error' => 'Failed to write site.json. Check folder permissions.']);
    }
    send_json(200, ['ok' => true]);
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
    write_json_file(DATA_DIR . '/submissions.json', []);
    send_json(200, ['success' => true, 'message' => 'All submissions cleared.']);
}

// ── GET: export_submissions_csv ───────────────────────────────────────────────
if ($action === 'export_submissions_csv' && $method === 'GET') {
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
    $payload = @json_decode(get_request_body(), true);
    if (!is_array($payload)) $payload = [];
    write_json_file(DATA_DIR . '/addons.json', $payload);
    send_json(200, ['success' => true, 'message' => 'Add-ons saved successfully']);
}

// ── GET: get_revisions ────────────────────────────────────────────────────────
if ($action === 'get_revisions' && $method === 'GET') {
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

// ── Fallback: unknown action ──────────────────────────────────────────────────
send_json(400, ['error' => 'Unknown or missing action: ' . htmlspecialchars($action)]);
