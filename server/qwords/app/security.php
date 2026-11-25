<?php
declare(strict_types=1);
namespace Visitiga\Qwords;

use PDO;
use RuntimeException;

function same_origin(array $request, array $config): void
{
    $origin = $request['origin'] ?? '';
    if (!is_string($origin) || !hash_equals($config['site_url'], $origin)) throw new ApiProblem(403, 'Origin request tidak diizinkan.');
}

function rate_limit(PDO $db, array $config, string $scope, string $identity, int $max, int $seconds): void
{
    $secret = $config['app_secret'] ?? '';
    if (!is_string($secret) || strlen($secret) < 32) throw new RuntimeException('Missing application secret');
    $key = hash_hmac('sha256', $scope . "\0" . $identity, $secret);
    $allowed = transaction($db, static function () use ($db, $key, $max, $seconds) {
        sql($db, 'INSERT INTO request_limits (scope_hash,expires_at,hits) VALUES (?,DATE_ADD(UTC_TIMESTAMP(),INTERVAL ? SECOND),1)
            ON DUPLICATE KEY UPDATE hits=IF(expires_at<=UTC_TIMESTAMP(),1,LEAST(hits+1,?)),
            expires_at=IF(expires_at<=UTC_TIMESTAMP(),VALUES(expires_at),expires_at)', [$key,$seconds,$max+1]);
        return (int) sql($db, 'SELECT hits FROM request_limits WHERE scope_hash=?', [$key])->fetchColumn() <= $max;
    });
    if (!$allowed) throw new ApiProblem(429, 'Rate limit exceeded. Coba kembali nanti.', 'rate_limit');
}

function open_admin_session(array $config): void
{
    if (session_status() === PHP_SESSION_ACTIVE) return;
    $location = realpath($config['session_path'] ?? (__DIR__ . '/../sessions'));
    if ($location === false || !is_dir($location) || !is_writable($location)) throw new RuntimeException('Session storage unavailable');
    $public = isset($config['_public_root']) ? realpath($config['_public_root']) : false;
    if ($public && ($location === $public || str_starts_with($location, $public . DIRECTORY_SEPARATOR))) throw new RuntimeException('Public session storage is not permitted');
    ini_set('session.use_strict_mode', '1');
    ini_set('session.use_only_cookies', '1');
    ini_set('session.use_trans_sid', '0');
    ini_set('session.gc_maxlifetime', '1800');
    session_save_path($location);
    session_name('__Host-visitiga_admin');
    session_set_cookie_params(['lifetime' => 0, 'path' => '/', 'secure' => true, 'httponly' => true, 'samesite' => 'Strict']);
    if (!session_start()) throw new RuntimeException('Session unavailable');
}

function current_admin(PDO $db, array $config, bool $optional = false, bool $keepOpen = false): ?array
{
    if (!isset($_COOKIE['__Host-visitiga_admin'])) {
        if ($optional) return null;
        throw new ApiProblem(401, 'Sesi admin tidak ditemukan.');
    }
    open_admin_session($config);
    $id = $_SESSION['admin_id'] ?? null;
    $now = time();
    $record = null;
    if (is_string($id) && $now - ($_SESSION['last_activity'] ?? 0) < 1800 && $now - ($_SESSION['created_at'] ?? 0) < 43200) {
        $record = sql($db, "SELECT id,email,session_version FROM admin_users WHERE id=? AND role='admin'", [$id])->fetch();
    }
    if (!$record || (int) $record['session_version'] !== ($_SESSION['session_version'] ?? null)) {
        $_SESSION = [];
        session_destroy();
        setcookie('__Host-visitiga_admin', '', ['expires' => 1, 'path' => '/', 'secure' => true, 'httponly' => true, 'samesite' => 'Strict']);
        if ($optional) return null;
        throw new ApiProblem(401, 'Sesi admin telah berakhir.');
    }
    $info = ['user' => ['id' => $record['id'], 'email' => $record['email'], 'role' => 'admin'],
        'csrf' => $_SESSION['csrf'], 'translationEnabled' => !empty($config['deepl_auth_key'])];
    if (!$keepOpen) session_write_close();
    return $info;
}

function csrf_check(array $request, array $admin): void
{
    if (!hash_equals($admin['csrf'], $request['csrf'] ?? '')) {
        if (session_status() === PHP_SESSION_ACTIVE) session_write_close();
        throw new ApiProblem(403, 'Token CSRF tidak valid.');
    }
}

function json_body(array $request): array
{
    if (strlen($request['body']) > 500000 || (int) ($request['content_length'] ?? 0) > 500000) throw new ApiProblem(413, 'Payload terlalu besar.');
    if (!preg_match('~^application/json(?:\s*;|$)~i', $request['content_type'] ?? '')) throw new ApiProblem(415, 'Gunakan JSON.');
    try { $data = json_decode($request['body'], true, 24, JSON_THROW_ON_ERROR); }
    catch (\JsonException) { throw new ApiProblem(400, 'JSON tidak valid.'); }
    if (!is_array($data) || ($data !== [] && array_is_list($data))) throw new ApiProblem(400, 'Objek JSON diperlukan.');
    return $data;
}

function session_endpoint(PDO $db, array $request, array $config): array
{
    $method = $request['method'];
    if ($method === 'GET') return json_result(200, current_admin($db, $config, true));
    same_origin($request, $config);
    if ($method === 'POST') {
        if (empty($request['https']) && !(($config['staging'] ?? false) && ($config['test_loopback'] ?? false) && ($request['ip'] ?? '') === '127.0.0.1')) throw new ApiProblem(403, 'HTTPS diperlukan.');
        $input = json_body($request);
        $email = strtolower(trim(bounded_text($input['email'] ?? null, 254)));
        $password = bounded_text($input['password'] ?? null, 256, 1);
        rate_limit($db, $config, 'login-ip', $request['ip'] ?? '', 30, 900);
        rate_limit($db, $config, 'login-email', $email, 8, 900);
        $record = sql($db, 'SELECT id,email,password_hash,role,session_version FROM admin_users WHERE email=?', [$email])->fetch();
        $dummyHash = '$2y$10$bfLMJAdkg9wgVgxxb.cvYeuXz1dEou./5Dcpa8reuRLgLVSpVHqk6';
        if (!password_verify($password, $record['password_hash'] ?? $dummyHash) || !$record || $record['role'] !== 'admin') throw new ApiProblem(401, 'Email atau kata sandi tidak valid.');
        if (password_needs_rehash($record['password_hash'], PASSWORD_DEFAULT)) {
            sql($db, 'UPDATE admin_users SET password_hash=? WHERE id=? AND password_hash=?', [password_hash($password, PASSWORD_DEFAULT), $record['id'], $record['password_hash']]);
        }
        open_admin_session($config);
        if (!session_regenerate_id(true)) throw new RuntimeException('Could not regenerate session');
        $_SESSION = ['admin_id' => $record['id'], 'csrf' => bin2hex(random_bytes(32)), 'last_activity' => time(),
            'created_at' => time(), 'session_version' => (int) $record['session_version']];
        session_write_close();
        return json_result(200, ['user' => ['id' => $record['id'], 'email' => $record['email'], 'role' => 'admin'],
            'csrf' => $_SESSION['csrf'], 'translationEnabled' => !empty($config['deepl_auth_key'])]);
    }
    if (!in_array($method, ['DELETE','PATCH'], true)) throw new ApiProblem(405, 'Metode tidak diizinkan.');
    csrf_check($request, current_admin($db, $config, false, true));
    if ($method === 'PATCH') {
        $_SESSION['last_activity'] = time();
        session_write_close();
    } else {
        $_SESSION = [];
        session_destroy();
        setcookie('__Host-visitiga_admin', '', ['expires' => 1, 'path' => '/', 'secure' => true, 'httponly' => true, 'samesite' => 'Strict']);
    }
    return json_result(200, ['ok' => true]);
}
