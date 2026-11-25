<?php
declare(strict_types=1);
require __DIR__ . '/private-cli.php';
try {
    $settings = private_cli_config($argv[1] ?? dirname(__DIR__) . '/config.php');
    $db = \Visitiga\Qwords\db($settings);
    \Visitiga\Qwords\purge_old_records($db, 5000);
    \Visitiga\Qwords\cleanup_media_files($db, $settings);
    echo "Maintenance batch complete.\n";
} catch (Throwable) {
    fwrite(STDERR, "Maintenance failed. Check private configuration and database.\n");
    exit(1);
}
