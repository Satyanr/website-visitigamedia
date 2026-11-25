<?php
// Temporary STAGING probe. Replace the digest with SHA-256 of a random token.
declare(strict_types=1);
ini_set('display_errors', '0');
header('Cache-Control: no-store');
header('X-Robots-Tag: noindex, nofollow');
header('X-Content-Type-Options: nosniff');

$https = in_array(strtolower($_SERVER['HTTPS'] ?? ''), ['on', '1'], true);
$token = $_SERVER['HTTP_X_QWORDS_PREFLIGHT'] ?? '';
if (!$https || ($_SERVER['REQUEST_METHOD'] ?? '') !== 'GET' || strlen($token) !== 64
    || !hash_equals('REPLACE_WITH_SHA256_DIGEST', hash('sha256', $token))) {
    http_response_code(404);
    exit;
}

$checks = ['https' => true, 'php_supported' => PHP_VERSION_ID >= 80200 && PHP_VERSION_ID < 80500];
foreach (['curl', 'openssl', 'mbstring', 'dom', 'json', 'libxml'] as $extension) {
    $checks['extension_' . $extension] = extension_loaded($extension);
}
$seconds = (int) ini_get('max_execution_time');
$memory = ini_parse_quantity((string) ini_get('memory_limit'));
$checks['execution_budget'] = $seconds === 0 || $seconds >= 30;
$checks['memory_budget'] = $memory === -1 || $memory >= 128 * 1024 * 1024;
$checks['authorization_forwarded'] = false;
$checks['private_files_readable'] = false;
$checks['outbound_https'] = false;
$private = dirname(__DIR__) . '/qwords-private';
try {
    foreach (['runtime.php', 'config.php', 'build.json', 'shell.html'] as $file) {
        if (!is_readable($private . '/' . $file)) throw new RuntimeException();
    }
    $checks['private_files_readable'] = true;
    require $private . '/runtime.php';
    $checks['authorization_forwarded'] = \Visitiga\Qwords\authorization_header($_SERVER, function_exists('getallheaders') ? getallheaders() : []) === 'Bearer qwords-preflight-check';
    $config = require $private . '/config.php';
    $build = json_decode(file_get_contents($private . '/build.json'), true, 32, JSON_THROW_ON_ERROR);
    if (($build['staging'] ?? false) !== true || ($build['offline'] ?? true)) throw new RuntimeException();
    \Visitiga\Qwords\validate_config($config, $build);
    $response = \Visitiga\Qwords\query($config, '\\Visitiga\\Qwords\\http_request', 'news', 'slug', ['published_at' => 'not.is.null', 'limit' => '1']);
    $checks['outbound_https'] = array_is_list($response);
} catch (Throwable) {
    // Report only check outcomes.
}
header('Content-Type: application/json; charset=utf-8');
http_response_code(in_array(false, $checks, true) ? 503 : 200);
echo json_encode($checks);
