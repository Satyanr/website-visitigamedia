<?php
declare(strict_types=1);
// Fixed private sibling. This path never depends on request parameters.
$runtime = dirname(__DIR__) . '/qwords-private/runtime.php';
if (!is_file($runtime)) {
    http_response_code(503);
    header('Cache-Control: no-store');
    header('X-Robots-Tag: noindex');
    exit('Application temporarily unavailable');
}
require $runtime;
\Visitiga\Qwords\run(__DIR__);
