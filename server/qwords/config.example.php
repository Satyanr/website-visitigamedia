<?php
// Copy to qwords-private/config.php OUTSIDE document root. Never put secrets in VITE_*.
return [
    'site_url' => '', // Must exactly match the HTTPS VITE_SITE_URL used to build.
    'supabase_url' => '', // Must match the build's public Supabase URL.
    'supabase_publishable_key' => '', // sb_publishable_... or legacy anon JWT; NEVER service_role.
    'deepl_auth_key' => '', // Server only; empty disables translation with HTTP 503.
    'staging' => true, // Must match QWORDS_STAGING at build time.
    'https_verified' => false, // Enable HSTS only after HTTPS is confirmed.
    // Exact old WordPress path => current LOCAL canonical path. Empty until audited.
    // Example format only: '/verified-old-path/' => '/id/news/verified-current-slug/',
    'legacy_redirects' => [],
];
