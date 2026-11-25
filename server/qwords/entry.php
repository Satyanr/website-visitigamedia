<?php
declare(strict_types=1);
ini_set('display_errors', '0');
// Fixed private sibling. This path never depends on request parameters.
$runtime = dirname(__DIR__) . '/qwords-private/runtime.php';
if (!is_readable($runtime)) {
    http_response_code(503);
    header('Cache-Control: no-store');
    header('X-Robots-Tag: noindex');
    exit('Application temporarily unavailable');
}
require $runtime;
\Visitiga\Qwords\run(__DIR__);
