<?php
declare(strict_types=1);
require __DIR__ . '/private-cli.php';
try {
    $settings = private_cli_config($argv[1] ?? dirname(__DIR__) . '/config.php');
    echo \Visitiga\Qwords\json_encode_safe(\Visitiga\Qwords\export_content(\Visitiga\Qwords\db($settings))) . PHP_EOL;
} catch (Throwable) {
    fwrite(STDERR, "Public export failed. Check credentials, schema and dataset size.\n");
    exit(1);
}
