<?php
declare(strict_types=1);
require dirname(__DIR__,2) . '/server/qwords/runtime.php';
\Visitiga\Qwords\run((string) getenv('QWORDS_TEST_PUBLIC_ROOT'), (string) getenv('QWORDS_TEST_PRIVATE_ROOT'));
