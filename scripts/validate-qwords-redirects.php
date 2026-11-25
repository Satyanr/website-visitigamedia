<?php
declare(strict_types=1);
require dirname(__DIR__) . '/server/qwords/runtime.php';

try {
    if (PHP_SAPI !== 'cli' || !isset($argv[1])) throw new RuntimeException('Usage: npm run validate:qwords-redirects -- private-inventory.json [release directory]');
    $release = $argv[2] ?? 'artifacts/qwords';
    $rows = json_decode(file_get_contents($argv[1]), true, 32, JSON_THROW_ON_ERROR);
    $build = json_decode(file_get_contents($release . '/qwords-private/build.json'), true, 32, JSON_THROW_ON_ERROR);
    \Visitiga\Qwords\migration_routes($rows, $build, $release . '/public_html');
    echo 'PASS: ' . count($rows) . " mapping rows. Verify inventory evidence and dynamic target statuses on staging.\n";
} catch (Throwable $error) {
    fwrite(STDERR, 'FAIL: ' . $error->getMessage() . PHP_EOL);
    exit(1);
}
