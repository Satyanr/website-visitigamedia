<?php
// Copy to qwords-private/config.php OUTSIDE document root. Never put secrets in VITE_*.
return [
    'site_url' => '', // Must exactly match the HTTPS VITE_SITE_URL used to build.
    'db' => ['host' => 'localhost', 'port' => 3306, 'name' => '', 'user' => '', 'password' => ''],
    'app_secret' => '', // Generate at least 32 random bytes, keep stable and private.
    'export_key' => '', // Optional separate random key for HTTPS content export.
    'data_path' => __DIR__ . '/../visitiga-data',
    'session_path' => __DIR__ . '/../visitiga-data/sessions',
    'media_path' => __DIR__ . '/../visitiga-data/media',
    'private_media_path' => __DIR__ . '/../visitiga-data/documents',
    'media_file_bytes' => 2097152,
    'media_quota_bytes' => 1073741824,
    'media_max_files' => 2000,
    'deepl_auth_key' => '', // Server only; empty disables translation with HTTP 503.
    'staging' => true, // Must match QWORDS_STAGING at build time.
    'https_verified' => false, // Enable HSTS only after HTTPS is confirmed.
    // Paste records validated by npm run validate:qwords-redirects. See migration runbook.
    'migration_routes' => [],
];
