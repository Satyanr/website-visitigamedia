<?php
declare(strict_types=1);
require dirname(__DIR__, 2) . '/server/qwords/runtime.php';
use function Visitiga\Qwords\handle;
use function Visitiga\Qwords\render_document;
use function Visitiga\Qwords\public_key_valid;

$root = $argv[1];
@mkdir($root . '/admin', 0777, true);
file_put_contents($root . '/admin/index.html', '<h1>Admin</h1>');
file_put_contents($root . '/404.html', '<h1>Not found</h1>');
foreach (['id', 'en'] as $lang) foreach (['', 'about/', 'careers/'] as $route) {
    @mkdir($root . '/' . $lang . '/' . $route, 0777, true);
    file_put_contents($root . '/' . $lang . '/' . $route . 'index.html', '<h1>Prerender</h1>');
}
$config = ['site_url' => 'https://stage.example.test', 'supabase_url' => 'https://db.supabase.co', 'supabase_publishable_key' => 'sb_publishable_test-only', 'deepl_auth_key' => 'test-provider-not-a-secret:fx', 'staging' => false, 'legacy_redirects' => ['/audited-old/' => '/id/about/']];
$build = ['site_url' => $config['site_url'], 'supabase_url' => $config['supabase_url'], 'staging' => false, 'static_routes' => ['/', '/about', '/careers']];
$shell = '<!doctype html><html><head><meta charset="UTF-8"><title>Old title</title><meta name="description" content="old"><link rel="canonical" href="/old/"><meta property="og:image" content="/old.png"></head><body><div id="root"></div><script type="module" src="/assets/app-abcdefgh.js"></script></body></html>';
$article = ['id' => 'news-1', 'slug' => 'current-news', 'title' => 'Current title', 'excerpt' => 'Current excerpt', 'content' => '<p>Full crawler content</p>', 'category' => 'LED', 'cover_image' => '/news/cover.webp', 'author' => 'Visitiga', 'published_at' => '2026-01-01T00:00:00Z', 'updated_at' => '2026-11-01T00:00:00Z', 'content_id' => ['title' => 'Judul terkini', 'seo_title' => 'SEO Indonesia'], 'content_en' => ['title' => 'English title']];
$portfolio = ['id' => '11111111-1111-1111-1111-111111111111', 'slug' => 'current-project', 'title' => 'Current project', 'description' => 'Project description', 'overview' => 'Project overview', 'image_url' => '/portfolio/project.webp', 'updated_at' => '2026-11-01T00:00:00Z'];
$mode = 'normal';
$requests = [];
$http = static function (string $url, array $headers, string $method = 'GET', ?string $body = null) use (&$article, &$portfolio, &$mode, &$requests): array {
    $requests[] = ['url' => $url, 'headers' => $headers, 'body' => $body];
    if ($mode === 'down') throw new RuntimeException('Sensitive provider exception must never be returned');
    if (str_contains($url, '/auth/v1/user')) {
        if ($mode === 'expired') return ['status' => 401, 'body' => '{}'];
        if ($mode === 'auth-down') return ['status' => 503, 'body' => '{}'];
        return ['status' => 200, 'body' => json_encode(['id' => 'admin-1', 'app_metadata' => ['role' => $mode === 'user' ? 'user' : 'admin'], 'user_metadata' => ['role' => 'admin']])];
    }
    if (str_contains($url, 'deepl.com')) {
        if ($mode === 'provider-error') return ['status' => 403, 'body' => '{"message":"sensitive provider text"}'];
        $input = json_decode($body, true);
        if (count($input['text']) > 50) throw new RuntimeException('DeepL batch limit exceeded');
        return ['status' => 200, 'body' => json_encode(['translations' => array_map(static fn ($text) => ['text' => 'Translated ' . $text], $input['text'])])];
    }
    if (isset($headers['Authorization'])) throw new RuntimeException('Publishable key incorrectly used as Bearer');
    parse_str(parse_url($url, PHP_URL_QUERY) ?? '', $query);
    $table = basename(parse_url($url, PHP_URL_PATH));
    $row = $table === 'news' ? $article : ($table === 'portfolios' ? $portfolio : null);
    if ($table === 'portfolio_slug_aliases') $rows = ($query['old_slug'] ?? '') === 'eq.old-project' ? [['portfolio_id' => '11111111-1111-1111-1111-111111111111']] : [];
    elseif (!$row) $rows = [];
    elseif (isset($query['slug']) && $query['slug'] !== 'eq.' . $row['slug']) $rows = [];
    else $rows = [$row];
    return ['status' => 200, 'body' => json_encode($rows)];
};
$call = static function (string $uri, string $method = 'GET', string $body = '', string $authorization = '') use (&$config, &$build, $shell, $root, $http): array {
    return handle(compact('uri', 'method', 'body', 'authorization'), $config, $build, $shell, $root, $http);
};
$checks = [];
$check = static function (string $name, bool $passed) use (&$checks): void { $checks[] = compact('name', 'passed'); };
foreach (['id', 'en'] as $locale) {
    $response = $call('/' . $locale . '/about/');
    $check('static public ' . $locale, $response['status'] === 200 && str_contains($response['body'], 'Prerender'));
    $check('static slash ' . $locale, ($call('/' . $locale . '/about')['headers']['Location'] ?? '') === '/' . $locale . '/about/');
    $check('direct index canonical ' . $locale, $call('/' . $locale . '/about/index.html')['status'] === 301);
}
foreach (['/admin', '/admin/login', '/admin/news', '/admin/careers/submissions'] as $path) $check('admin deep link ' . $path, $call($path)['status'] === 200 && $call($path)['headers']['X-Robots-Tag'] === 'noindex, nofollow');
$response = $call('/id/news/current-news/');
$check('localized dynamic news SEO', $response['status'] === 200 && str_contains($response['body'], 'SEO Indonesia') && str_contains($response['body'], '<h1>Judul terkini</h1>'));
$check('canonical hreflang and JSON-LD', str_contains($response['body'], 'https://stage.example.test/id/news/current-news/') && str_contains($response['body'], 'hreflang="en"') && str_contains($response['body'], 'hreflang="x-default"') && str_contains($response['body'], 'Article') && str_contains($response['body'], 'BreadcrumbList'));
$check('dynamic cache bypasses browser and LiteSpeed cache', $response['headers']['Cache-Control'] === 'no-store' && $response['headers']['X-LiteSpeed-Cache-Control'] === 'no-cache');
$article['content_id']['seo_title'] = 'SEO EDITED';
$check('CMS edits visible on next request', str_contains($call('/id/news/current-news/')['body'], 'SEO EDITED'));
$check('dynamic portfolio SEO', $call('/en/portfolio/current-project/')['status'] === 200 && str_contains($call('/en/portfolio/current-project/')['body'], 'CreativeWork'));
$check('portfolio alias 301', ($call('/id/portfolio/old-project/')['headers']['Location'] ?? '') === '/id/portfolio/current-project/');
$check('audited WordPress mapping 301', ($call('/audited-old/')['headers']['Location'] ?? '') === '/id/about/');
$check('legacy locale redirect', ($call('/news/current-news/')['headers']['Location'] ?? '') === '/en/news/current-news/');
$check('missing content is 404', $call('/id/news/missing/')['status'] === 404 && $call('/en/portfolio/missing/')['status'] === 404);
$check('invalid locale and slug are 404', $call('/fr/news/current-news/')['status'] === 404 && $call('/id/news/INVALID/')['status'] === 404);
$check('traversal rejected', $call('/id/../config.php')['status'] === 404 && $call('/%2eenv')['status'] === 404);
$article['published_at'] = null;
$check('unpublished news is 404', $call('/id/news/current-news/')['status'] === 404);
$article['published_at'] = '2026-01-01T00:00:00Z';
$article['content_id']['title'] = '</script><img src=x onerror=alert(1)>';
$article['content'] = '<script>alert(1)</script><p>Safe text</p>';
$response = $call('/id/news/current-news/');
$check('XSS escaped in HTML and bootstrap JSON', !str_contains($response['body'], '<img src=x') && !str_contains($response['body'], '<script>alert(1)') && str_contains($response['body'], '\\u003C'));
$article['cover_image'] = 'javascript:alert(1)';
$check('unsafe OG image rejected', str_contains($call('/id/news/current-news/')['body'], 'https://stage.example.test/social-preview.png'));
$sitemap = $call('/sitemap.xml');
$check('live sitemap includes localized records and careers', $sitemap['status'] === 200 && str_contains($sitemap['body'], '/en/news/current-news/') && str_contains($sitemap['body'], '/id/portfolio/current-project/') && str_contains($sitemap['body'], '/id/careers/') && str_contains($sitemap['body'], 'hreflang="x-default"'));
$savedArticle = $article; $article = null;
$check('deleted news is 404', $call('/id/news/current-news/')['status'] === 404);
$check('deleted news removed from sitemap', !str_contains($call('/sitemap.xml')['body'], '/news/current-news/'));
$article = $savedArticle;
$mode = 'down';
$response = $call('/id/news/current-news/');
$check('upstream failure 503 without exception leak', $response['status'] === 503 && !str_contains($response['body'], 'Sensitive') && $response['headers']['Cache-Control'] === 'no-store');
$check('unavailable sitemap 503 instead of stale XML', $call('/sitemap.xml')['status'] === 503);
$check('static remains available during Supabase outage', $call('/id/about/')['status'] === 200);
$mode = 'normal';
$payload = json_encode(['source_locale' => 'en', 'target_locale' => 'id', 'content' => ['title' => 'Hello', 'slug' => 'do-not-translate', 'url' => 'https://example.test']]);
$jwt = 'Bearer test.token.signature';
$check('translation anonymous rejected', $call('/api/translate-content', 'POST', $payload)['status'] === 401);
$check('translation method protected', $call('/api/translate-content', 'GET')['status'] === 405);
$mode = 'user';
$check('user_metadata admin cannot grant access', $call('/api/translate-content', 'POST', $payload, $jwt)['status'] === 401);
$mode = 'expired';
$check('expired JWT rejected by Supabase', $call('/api/translate-content', 'POST', $payload, $jwt)['status'] === 401);
$mode = 'auth-down';
$check('auth unavailable returns 503', $call('/api/translate-content', 'POST', $payload, $jwt)['status'] === 503);
$mode = 'normal';
$response = $call('/api/translate-content', 'POST', $payload, $jwt);
$translated = json_decode($response['body'], true);
$check('admin translation preserves API and protected fields', $response['status'] === 200 && $translated['content']['title'] === 'Translated Hello' && $translated['content']['slug'] === 'do-not-translate' && $translated['content']['url'] === 'https://example.test');
$check('Supabase verifies the actual user JWT', count(array_filter($requests, static fn ($request) => str_contains($request['url'], '/auth/v1/user') && $request['headers']['Authorization'] === 'Bearer test.token.signature')) > 0);
$check('malformed JSON rejected', $call('/api/translate-content', 'POST', '{', $jwt)['status'] === 400);
$check('oversize payload rejected', $call('/api/translate-content', 'POST', str_repeat('a', 120001), $jwt)['status'] === 413);
$tooMany = json_encode(['source_locale' => 'en', 'target_locale' => 'id', 'content' => array_fill(0, 251, 'Hello')]);
$check('field limit enforced without silent truncation', $call('/api/translate-content', 'POST', $tooMany, $jwt)['status'] === 413);
$longText = json_encode(['source_locale' => 'en', 'target_locale' => 'id', 'content' => ['title' => str_repeat('x', 12001)]]);
$check('per-text limit enforced', $call('/api/translate-content', 'POST', $longText, $jwt)['status'] === 413);
$batch = json_encode(['source_locale' => 'en', 'target_locale' => 'id', 'content' => array_fill(0, 51, 'Hello')]);
$check('DeepL text batches respect provider limit', $call('/api/translate-content', 'POST', $batch, $jwt)['status'] === 200);
$mode = 'provider-error';
$response = $call('/api/translate-content', 'POST', $payload, $jwt);
$check('provider errors do not leak details', $response['status'] === 502 && !str_contains($response['body'], 'sensitive') && !str_contains($response['body'], $config['deepl_auth_key']));
$mode = 'normal';
$config['staging'] = true; $build['staging'] = true;
$check('staging robots disallows indexing', str_contains($call('/robots.txt')['body'], 'Disallow: /'));
$check('staging dynamic meta noindex', str_contains($call('/en/news/current-news/')['body'], 'noindex, follow'));
$config['site_url'] = 'https://wrong.example.test';
$check('mismatched origin fails closed', $call('/id/about/')['status'] === 503);
$check('privileged keys rejected', !public_key_valid('sb_secret_test') && !public_key_valid('bad-key'));
echo json_encode($checks, JSON_THROW_ON_ERROR);
