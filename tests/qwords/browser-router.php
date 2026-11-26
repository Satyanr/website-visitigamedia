<?php
// LOCAL TEST ROUTER ONLY. Not packaged. No outbound network requests.
declare(strict_types=1);
require dirname(__DIR__, 2) . '/server/qwords/runtime.php';
$root = dirname(__DIR__, 2) . '/artifacts/qwords/public_html';
$private = dirname($root) . '/qwords-private';
$build = json_decode(file_get_contents($private . '/build.json'), true);
if (PHP_SAPI !== 'cli-server' || !$build['staging'] || ($build['backend'] ?? '') !== 'mysql'
    || (!$build['offline'] && getenv('QWORDS_TEST_BROWSER_ORIGIN') !== $build['site_url'])) {
    http_response_code(503);
    exit('Testing artifact required');
}
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
if (is_file($root . $path) && !str_ends_with($path, '.html') && !str_ends_with($path, '.php') && !str_starts_with($path, '/.')) return false;
$config = ['site_url' => $build['site_url'], 'staging' => true, 'legacy_redirects' => []];
$tables = json_decode(file_get_contents(__DIR__ . '/browser-data.json'), true);
$http = static function ($url, $headers) use ($tables): array {
    parse_str(parse_url($url, PHP_URL_QUERY) ?? '', $query);
    $table = basename(parse_url($url, PHP_URL_PATH));
    $rows = $tables[$table] ?? [];
    if (isset($query['slug'])) $rows = array_values(array_filter($rows, static fn ($row) => 'eq.' . $row['slug'] === $query['slug']));
    return ['status' => 200, 'body' => json_encode($rows)];
};
$config['_read'] = static function ($table,$select,$filters) use ($http) {
    return json_decode($http('https://fixture.example.test/' . $table . '?' . http_build_query($filters),[])['body'],true);
};
$request = ['uri' => $_SERVER['REQUEST_URI'], 'method' => $_SERVER['REQUEST_METHOD'], 'body' => file_get_contents('php://input'), 'authorization' => $_SERVER['HTTP_AUTHORIZATION'] ?? ''];
$response = \Visitiga\Qwords\handle($request, $config, $build, file_get_contents($private . '/shell.html'), $root, $http);
http_response_code($response['status']);
foreach ($response['headers'] as $name => $value) header($name . ': ' . $value);
if (preg_match('/Header always set Content-Security-Policy "([^"]+)"/', file_get_contents($root . '/.htaccess'), $csp)) header('Content-Security-Policy: ' . $csp[1]);
header('X-Robots-Tag: noindex, nofollow');
if ($_SERVER['REQUEST_METHOD'] !== 'HEAD') echo $response['body'];
