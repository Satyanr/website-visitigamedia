<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }

require dirname(__DIR__) . '/runtime.php';

function private_cli_config(string $path): array
{
    if (!is_file($path) || !is_readable($path)) throw new RuntimeException('Private configuration unavailable.');
    $settings = require $path;
    if (!is_array($settings)) throw new RuntimeException('Private configuration invalid.');
    return $settings;
}
