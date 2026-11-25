<?php
declare(strict_types=1);
namespace Visitiga\Qwords;

use RuntimeException;
use Throwable;

const MAX_PAYLOAD = 120000;
const MAX_TEXT = 12000;
const MAX_NODES = 250;

function escape(string $text): string
{
    return htmlspecialchars($text, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function json_encode_safe(mixed $value): string
{
    return json_encode($value, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
}

function authorization_header(array $server, array $headers = []): string
{
    foreach (['HTTP_AUTHORIZATION', 'REDIRECT_HTTP_AUTHORIZATION'] as $name) if (!empty($server[$name])) return (string) $server[$name];
    foreach ($headers as $name => $value) if (strcasecmp((string) $name, 'Authorization') === 0) return (string) $value;
    return '';
}

function slug_valid(string $slug): bool
{
    return strlen($slug) <= 120 && preg_match('/^[a-z0-9]+(?:-[a-z0-9]+)*$/D', $slug) === 1;
}

function origin_valid(string $url): bool
{
    return preg_match('~^https://[a-z0-9.-]+(?::[0-9]+)?$~iD', $url) === 1;
}

function public_key_valid(string $key): bool
{
    if (preg_match('/^sb_publishable_[A-Za-z0-9_-]+$/D', $key)) return true;
    $parts = explode('.', $key);
    if (count($parts) !== 3) return false;
    $claims = json_decode((string) base64_decode(strtr($parts[1], '-_', '+/'), true), true);
    return is_array($claims) && ($claims['role'] ?? '') === 'anon';
}

function validate_config(array $config, array $build): void
{
    foreach (['site_url', 'supabase_url'] as $name) {
        if (!origin_valid($config[$name] ?? '') || ($config[$name] ?? '') !== ($build[$name] ?? '')) throw new RuntimeException('Build configuration mismatch');
    }
    if (!public_key_valid($config['supabase_publishable_key'] ?? '')) throw new RuntimeException('A public Supabase key is required');
    if (($config['staging'] ?? true) !== ($build['staging'] ?? true)) throw new RuntimeException('Staging configuration mismatch');
    foreach ($config['legacy_redirects'] ?? [] as $from => $to) {
        if (!is_string($from) || !is_string($to) || !preg_match('~^/[^\s?#\\\\]*$~D', $from)
            || !preg_match('~^/(?:id|en)/(?:[a-z0-9-]+/)*$~D', $to) || $from === $to
            || array_key_exists($to, $config['legacy_redirects'])) throw new RuntimeException('Invalid legacy redirect');
    }
}

/** Fixed server-side destinations only. No redirects; bounded TLS requests. */
function http_request(string $url, array $headers, string $method = 'GET', ?string $body = null): array
{
    $handle = curl_init($url);
    if ($handle === false) throw new RuntimeException('Upstream unavailable');
    $lines = [];
    foreach ($headers as $name => $value) $lines[] = $name . ': ' . $value;
    $responseBody = '';
    curl_setopt_array($handle, [
        CURLOPT_HTTPHEADER => $lines, CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_CONNECTTIMEOUT => 3, CURLOPT_TIMEOUT => 12,
        CURLOPT_FOLLOWLOCATION => false, CURLOPT_PROTOCOLS => CURLPROTO_HTTPS,
        CURLOPT_SSL_VERIFYPEER => true, CURLOPT_SSL_VERIFYHOST => 2,
        CURLOPT_WRITEFUNCTION => static function ($curl, string $chunk) use (&$responseBody): int {
            if (strlen($responseBody) + strlen($chunk) > 8 * 1024 * 1024) return 0;
            $responseBody .= $chunk;
            return strlen($chunk);
        },
    ]);
    if ($body !== null) curl_setopt($handle, CURLOPT_POSTFIELDS, $body);
    $ok = curl_exec($handle);
    $status = (int) curl_getinfo($handle, CURLINFO_RESPONSE_CODE);
    curl_close($handle);
    if ($ok === false || $status === 0) throw new RuntimeException('Upstream unavailable');
    return ['status' => $status, 'body' => $responseBody];
}

function db_headers(array $config): array
{
    $key = $config['supabase_publishable_key'];
    $headers = ['apikey' => $key, 'Accept' => 'application/json'];
    if (!str_starts_with($key, 'sb_publishable_')) $headers['Authorization'] = 'Bearer ' . $key;
    return $headers;
}

function query(array $config, callable $http, string $table, string $select, array $filters = []): array
{
    $url = $config['supabase_url'] . '/rest/v1/' . $table . '?' . http_build_query(['select' => $select] + $filters, '', '&', PHP_QUERY_RFC3986);
    $response = $http($url, db_headers($config));
    if ($response['status'] !== 200) throw new RuntimeException('Database unavailable');
    $rows = json_decode($response['body'], true, 64, JSON_THROW_ON_ERROR);
    if (!is_array($rows) || !array_is_list($rows)) throw new RuntimeException('Invalid database response');
    return $rows;
}

function query_one(array $config, callable $http, string $table, string $column, string $value): ?array
{
    return query($config, $http, $table, '*', [$column => 'eq.' . $value, 'limit' => '1'])[0] ?? null;
}

function query_all(array $config, callable $http, string $table, string $select, array $filters): array
{
    $all = [];
    for ($offset = 0; $offset < 50000; $offset += 500) {
        $page = query($config, $http, $table, $select, $filters + ['limit' => '500', 'offset' => (string) $offset]);
        array_push($all, ...$page);
        if (count($page) < 500) return $all;
    }
    throw new RuntimeException('Sitemap needs pagination into multiple files');
}

function result(int $status, string $body, string $type = 'text/html; charset=utf-8', array $extra = []): array
{
    return ['status' => $status, 'body' => $body, 'headers' => $extra + [
        'Content-Type' => $type, 'Cache-Control' => 'no-store', 'X-LiteSpeed-Cache-Control' => 'no-cache',
        'X-Content-Type-Options' => 'nosniff', 'X-Frame-Options' => 'DENY',
        'Referrer-Policy' => 'strict-origin-when-cross-origin',
    ]];
}

function json_result(int $status, array $body, array $headers = []): array
{
    return result($status, json_encode_safe($body), 'application/json; charset=utf-8', $headers);
}

function redirect(string $target): array
{
    return result(301, '', 'text/plain; charset=utf-8', ['Location' => $target]);
}

function plain(string $value): string
{
    return trim((string) preg_replace('/\s+/u', ' ', html_entity_decode(strip_tags($value), ENT_QUOTES | ENT_HTML5, 'UTF-8')));
}

function image_url(string $image, string $site): string
{
    if (preg_match('~^https://[^\s<>"\x27]+$~D', $image)) return $image;
    if (str_starts_with($image, '/') && !str_starts_with($image, '//') && !preg_match('/[\s<>"\x27\\\\]/', $image)) return $site . $image;
    return $site . '/social-preview.png';
}

function localized(array $row, string $locale): array
{
    $content = $row['content_' . $locale] ?? [];
    // Locale payloads may change text, never identity, publication state or URLs.
    $fields = ['title', 'excerpt', 'content', 'author', 'category', 'description', 'overview', 'client', 'seo_title', 'seo_description', 'cover_alt', 'target_keyword'];
    foreach ($fields as $field) if (isset($content[$field]) && is_string($content[$field])) $row[$field] = $content[$field];
    return $row;
}

/** Same crawler preview model as Pages Functions; React renders the existing UI. */
function render_document(string $shell, array $row, string $kind, string $locale, array $config): string
{
    $display = localized($row, $locale);
    $site = $config['site_url'];
    $route = '/' . $locale . '/' . $kind . '/' . $row['slug'] . '/';
    $title = (trim($display['seo_title'] ?? '') ?: $display['title']) . ($kind === 'news' ? ' — Visitiga' : ' | Visitiga Media');
    $description = trim($display['seo_description'] ?? '') ?: ($display['excerpt'] ?? $display['description'] ?? mb_substr(plain($display['content'] ?? ''), 0, 160));
    $image = image_url($row[$kind === 'news' ? 'cover_image' : 'image_url'] ?? '', $site);
    $canonical = $site . $route;
    $document = new \DOMDocument('1.0', 'UTF-8');
    $previousErrors = libxml_use_internal_errors(true);
    $document->loadHTML('<?xml encoding="UTF-8">' . $shell, LIBXML_NONET);
    libxml_clear_errors();
    libxml_use_internal_errors($previousErrors);
    foreach (iterator_to_array($document->childNodes) as $child) if ($child->nodeType === XML_PI_NODE) $document->removeChild($child);
    $head = $document->getElementsByTagName('head')->item(0);
    $xpath = new \DOMXPath($document);
    foreach ($xpath->query('//title | //meta[@name="description" or @name="robots" or starts-with(@name,"twitter:") or starts-with(@property,"og:")] | //link[@rel="canonical" or @hreflang] | //script[@type="application/ld+json" or @id="visitiga-prerender-data"]') as $node) $node->parentNode->removeChild($node);
    $titleNode = $document->createElement('title');
    $titleNode->appendChild($document->createTextNode($title));
    $head->appendChild($titleNode);
    $metas = [
        'description' => $description, 'robots' => ($config['staging'] ?? true) ? 'noindex, follow' : 'index, follow',
        'og:title' => $title, 'og:description' => $description, 'og:type' => $kind === 'news' ? 'article' : 'website',
        'og:url' => $canonical, 'og:image' => $image, 'og:image:alt' => $display['cover_alt'] ?? $display['title'],
        'og:locale' => $locale === 'id' ? 'id_ID' : 'en_US', 'og:site_name' => 'Visitiga Media',
        'twitter:card' => 'summary_large_image', 'twitter:title' => $title, 'twitter:description' => $description, 'twitter:image' => $image,
    ];
    if ($kind === 'news') {
        $metas['article:published_time'] = $row['published_at'];
        $metas['article:modified_time'] = $row['updated_at'] ?? $row['published_at'];
    }
    foreach ($metas as $key => $value) {
        $node = $document->createElement('meta');
        $node->setAttribute(str_starts_with($key, 'og:') || str_starts_with($key, 'article:') ? 'property' : 'name', $key);
        $node->setAttribute('content', (string) $value);
        $head->appendChild($node);
    }
    foreach (['canonical' => $locale, 'id' => 'id', 'en' => 'en', 'x-default' => 'en'] as $key => $language) {
        $node = $document->createElement('link');
        $node->setAttribute('rel', $key === 'canonical' ? 'canonical' : 'alternate');
        if ($key !== 'canonical') $node->setAttribute('hreflang', $key);
        $node->setAttribute('href', $site . '/' . $language . '/' . $kind . '/' . $row['slug'] . '/');
        $head->appendChild($node);
    }
    $schema = [
        '@context' => 'https://schema.org', '@type' => $kind === 'news' ? 'Article' : 'CreativeWork',
        $kind === 'news' ? 'headline' : 'name' => $display['title'], 'description' => $description, 'image' => $image,
        'url' => $canonical, 'mainEntityOfPage' => $canonical,
        'publisher' => ['@type' => 'Organization', 'name' => 'Visitiga Media', 'logo' => ['@type' => 'ImageObject', 'url' => $site . '/visitiga-media-logo.png']],
    ];
    if ($kind === 'news') $schema += ['datePublished' => $row['published_at'], 'dateModified' => $row['updated_at'] ?? $row['published_at'], 'author' => ['@type' => 'Person', 'name' => $display['author'] ?? 'Visitiga Media']];
    $breadcrumbs = ['@context' => 'https://schema.org', '@type' => 'BreadcrumbList', 'itemListElement' => [
        ['@type' => 'ListItem', 'position' => 1, 'name' => $locale === 'id' ? 'Beranda' : 'Home', 'item' => $site . '/' . $locale . '/'],
        ['@type' => 'ListItem', 'position' => 2, 'name' => $kind === 'news' ? ($locale === 'id' ? 'Berita' : 'News') : 'Portfolio', 'item' => $site . '/' . $locale . '/' . $kind . '/'],
        ['@type' => 'ListItem', 'position' => 3, 'name' => $display['title'], 'item' => $canonical],
    ]];
    $bootstrap = ['route' => $route] + ($kind === 'news' ? ['article' => $row, 'news' => [$row]] : ['portfolio' => $row, 'portfolios' => [$row]]);
    foreach ([['page-structured-data', 'application/ld+json', [$schema, $breadcrumbs]], ['visitiga-prerender-data', 'application/json', $bootstrap]] as [$id, $type, $data]) {
        $node = $document->createElement('script');
        $node->setAttribute('id', $id);
        $node->setAttribute('type', $type);
        $node->appendChild($document->createTextNode(json_encode_safe($data)));
        $head->appendChild($node);
    }
    $html = $document->getElementsByTagName('html')->item(0);
    $html->setAttribute('lang', $locale);
    $html->setAttribute('data-prerendered', 'true');
    $html->setAttribute('data-site-url', $site);
    $preview = $document->createElement('div');
    $preview->setAttribute('id', 'prerender-content');
    $main = $document->createElement('main');
    $main->setAttribute('id', 'main-content');
    $article = $document->createElement('article');
    foreach ([['p', $display['category'] ?? ''], ['h1', $display['title']], ['p', $display['excerpt'] ?? $display['description'] ?? ''], ['p', plain($display['content'] ?? $display['overview'] ?? '')]] as [$tag, $text]) {
        $node = $document->createElement($tag);
        $node->appendChild($document->createTextNode((string) $text));
        $article->appendChild($node);
    }
    $img = $document->createElement('img');
    $img->setAttribute('src', $image);
    $img->setAttribute('alt', $display['cover_alt'] ?? $display['title']);
    $article->appendChild($img);
    $main->appendChild($article);
    $preview->appendChild($main);
    $root = $document->getElementById('root');
    if (!$root) throw new RuntimeException('Application shell is missing');
    $root->parentNode->insertBefore($preview, $root);
    $style = $document->createElement('style', '#root{display:none}');
    $style->setAttribute('id', 'prerender-swap-style');
    $head->appendChild($style);
    return $document->saveHTML();
}

function detail(array $config, callable $http, string $shell, string $locale, string $kind, string $slug): array
{
    if (!slug_valid($slug)) return result(404, 'Not found', 'text/plain; charset=utf-8', ['X-Robots-Tag' => 'noindex']);
    $row = query_one($config, $http, $kind === 'news' ? 'news' : 'portfolios', 'slug', $slug);
    if ($kind === 'portfolio' && !$row) {
        $alias = query_one($config, $http, 'portfolio_slug_aliases', 'old_slug', $slug);
        if ($alias && preg_match('/^[a-f0-9-]{36}$/iD', $alias['portfolio_id'] ?? '')) $row = query_one($config, $http, 'portfolios', 'id', $alias['portfolio_id']);
        if ($row && slug_valid($row['slug'] ?? '')) return redirect('/' . $locale . '/portfolio/' . $row['slug'] . '/');
    }
    if (!$row || ($kind === 'news' && empty($row['published_at']))) return result(404, 'Content not found', 'text/plain; charset=utf-8', ['X-Robots-Tag' => 'noindex']);
    if (!slug_valid($row['slug'] ?? '') || $row['slug'] !== $slug) throw new RuntimeException('Invalid record identity');
    return result(200, render_document($shell, $row, $kind, $locale, $config));
}

function sitemap(array $config, array $build, callable $http): array
{
    $news = query_all($config, $http, 'news', 'slug,updated_at,published_at', ['published_at' => 'not.is.null', 'order' => 'slug.asc']);
    $portfolios = query_all($config, $http, 'portfolios', 'slug,updated_at', ['order' => 'slug.asc']);
    $routes = array_map(static fn ($path) => ['path' => $path], $build['static_routes']);
    foreach (['news' => $news, 'portfolio' => $portfolios] as $kind => $rows) foreach ($rows as $row) {
        if (!slug_valid($row['slug'] ?? '')) throw new RuntimeException('Invalid sitemap slug');
        $routes[] = ['path' => '/' . $kind . '/' . $row['slug'], 'lastmod' => $row['updated_at'] ?? $row['published_at'] ?? null];
    }
    $xml = '<?xml version="1.0" encoding="UTF-8"?>' . "\n" . '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">';
    foreach ($routes as $entry) foreach (['id', 'en'] as $locale) {
        $path = $entry['path'] === '/' ? '/' : rtrim($entry['path'], '/') . '/';
        $xml .= '<url><loc>' . escape($config['site_url'] . '/' . $locale . $path) . '</loc>';
        foreach (['id' => 'id', 'en' => 'en', 'x-default' => 'en'] as $alternate => $language) $xml .= '<xhtml:link rel="alternate" hreflang="' . $alternate . '" href="' . escape($config['site_url'] . '/' . $language . $path) . '" />';
        if (!empty($entry['lastmod'])) {
            $time = strtotime($entry['lastmod']);
            if ($time === false) throw new RuntimeException('Invalid modification date');
            $xml .= '<lastmod>' . gmdate('c', $time) . '</lastmod>';
        }
        $xml .= '</url>';
    }
    return result(200, $xml . '</urlset>', 'application/xml; charset=utf-8');
}

function collect_strings(mixed $value, array $path, array &$nodes): void
{
    if (is_string($value)) {
        $key = (string) ($path[count($path) - 1] ?? '');
        if (preg_match('/(?:^|_)(?:id|ids|slug|url|uri|path|image|video|pdf|file|media|color|status|date|phone|email|keyword|sort|order|type|category_id)(?:$|_)/i', $key)
            || preg_match('~^(?:https?://|mailto:|tel:|/|data:)~i', trim($value)) || filter_var(trim($value), FILTER_VALIDATE_EMAIL)
            || preg_match('/^\+?[\d\s().-]{7,}$/D', trim($value)) || trim($value) === '') return;
        if (mb_strlen($value) > MAX_TEXT) throw new \LengthException('Text too long');
        $nodes[] = ['path' => $path, 'text' => $value];
        if (count($nodes) > MAX_NODES) throw new \LengthException('Too many text fields');
    } elseif (is_array($value) || is_object($value)) {
        foreach ($value as $key => $item) collect_strings($item, [...$path, $key], $nodes);
    }
}

function set_path(mixed &$content, array $path, string $replacement): void
{
    $current =& $content;
    foreach ($path as $key) {
        if (is_object($current)) $current =& $current->{$key};
        else $current =& $current[$key];
    }
    $current = $replacement;
}

function translate(array $request, array $config, callable $http): array
{
    if ($request['method'] !== 'POST') return json_result(405, ['error' => 'Method not allowed.'], ['Allow' => 'POST']);
    if (strlen($request['body']) > MAX_PAYLOAD || (int) ($request['content_length'] ?? 0) > MAX_PAYLOAD) return json_result(413, ['error' => 'Translation payload is too large.']);
    $token = $request['authorization'] ?? '';
    if (!preg_match('/^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/D', $token)) return json_result(401, ['error' => 'Unauthorized.']);
    // Do not decode an unverified JWT to decide admin status. Auth verifies it.
    $auth = $http($config['supabase_url'] . '/auth/v1/user', ['apikey' => $config['supabase_publishable_key'], 'Authorization' => $token]);
    if (in_array($auth['status'], [401, 403], true)) return json_result(401, ['error' => 'Unauthorized.']);
    if ($auth['status'] !== 200) return json_result(503, ['error' => 'Authentication service unavailable.']);
    $user = json_decode($auth['body'], true, 32, JSON_THROW_ON_ERROR);
    if (empty($user['id']) || ($user['app_metadata']['role'] ?? '') !== 'admin') return json_result(401, ['error' => 'Unauthorized.']);
    if (empty($config['deepl_auth_key'])) return json_result(503, ['error' => 'Translation service is not configured.']);
    try { $body = json_decode($request['body'], false, 32, JSON_THROW_ON_ERROR); }
    catch (\JsonException) { return json_result(400, ['error' => 'Invalid JSON body.']); }
    $source = $body->source_locale ?? null;
    $target = $body->target_locale ?? null;
    $content = $body->content ?? null;
    if (!in_array($source, ['id', 'en'], true) || !in_array($target, ['id', 'en'], true) || $source === $target || (!is_object($content) && !is_array($content))) return json_result(400, ['error' => 'Invalid translation request.']);
    $nodes = [];
    try { collect_strings($content, [], $nodes); }
    catch (\LengthException) { return json_result(413, ['error' => 'Translation text limit exceeded.']); }
    if (!$nodes) return json_result(200, ['content' => $content]);
    // DeepL permits at most 50 texts per request. Preserve the 250-field contract
    // by batching, with a total request deadline (no partial success response).
    $deadline = microtime(true) + 45;
    $translatedTexts = [];
    $batches = []; $batch = []; $batchBytes = 0;
    foreach ($nodes as $node) {
        $nodeBytes = strlen(json_encode_safe($node['text'])) + 1;
        if ($batch && (count($batch) >= 50 || $batchBytes + $nodeBytes > 110000)) {
            $batches[] = $batch; $batch = []; $batchBytes = 0;
        }
        $batch[] = $node; $batchBytes += $nodeBytes;
    }
    if ($batch) $batches[] = $batch;
    foreach ($batches as $batch) {
        if (microtime(true) > $deadline) return json_result(504, ['error' => 'Translation timed out.']);
        $params = ['text' => array_column($batch, 'text'), 'source_lang' => strtoupper($source), 'target_lang' => strtoupper($target), 'preserve_formatting' => true];
        foreach ($batch as $node) if (preg_match('/<[^>]+>/', $node['text'])) $params['tag_handling'] = 'html';
        $endpoint = str_ends_with($config['deepl_auth_key'], ':fx') ? 'https://api-free.deepl.com/v2/translate' : 'https://api.deepl.com/v2/translate';
        $response = $http($endpoint, ['Authorization' => 'DeepL-Auth-Key ' . $config['deepl_auth_key'], 'Content-Type' => 'application/json'], 'POST', json_encode_safe($params));
        if ($response['status'] !== 200) return json_result(502, ['error' => 'Translation provider failed.']);
        $data = json_decode($response['body'], true, 64, JSON_THROW_ON_ERROR);
        if (!isset($data['translations']) || count($data['translations']) !== count($batch)) return json_result(502, ['error' => 'Translation response is incomplete.']);
        foreach ($data['translations'] as $translation) {
            if (!is_string($translation['text'] ?? null)) return json_result(502, ['error' => 'Translation response is incomplete.']);
            $translatedTexts[] = $translation['text'];
        }
    }
    foreach ($nodes as $index => $node) set_path($content, $node['path'], $translatedTexts[$index]);
    return json_result(200, ['content' => $content]);
}

/** Pure dispatcher, shared by PHP integration tests and the production entry. */
function handle(array $request, array $config, array $build, string $shell, string $publicRoot, callable $http): array
{
    try {
        validate_config($config, $build);
        $path = rawurldecode(explode('?', $request['uri'], 2)[0]);
        if (!str_starts_with($path, '/') || str_contains($path, '\\') || str_contains($path, '//') || preg_match('~(?:^|/)\.|[\x00-\x20\x7f]~', $path)) return result(404, 'Not found');
        if ($path === '/api/translate-content' || $path === '/api/translate-content/') return translate($request, $config, $http);
        if (!in_array($request['method'], ['GET', 'HEAD'], true)) return result(405, 'Method not allowed', 'text/plain', ['Allow' => 'GET, HEAD']);
        if (isset($config['legacy_redirects'][$path])) return redirect($config['legacy_redirects'][$path]);
        if ($path === '/robots.txt') return result(200, ($config['staging'] ? "User-agent: *\nDisallow: /\n" : "User-agent: *\nAllow: /\nDisallow: /admin\n\nSitemap: " . $config['site_url'] . "/sitemap.xml\n"), 'text/plain; charset=utf-8');
        if ($path === '/sitemap.xml') return sitemap($config, $build, $http);
        if ($path === '/' || $path === '/index.html') return redirect('/en/');
        if (preg_match('~^/(id|en)/(news|portfolio)/([^/]+)/?$~D', $path, $matches)) {
            if (!slug_valid($matches[3])) return result(404, 'Not found');
            // Confirm existence before adding slash: missing content stays a 404.
            $response = detail($config, $http, $shell, $matches[1], $matches[2], $matches[3]);
            if ($response['status'] === 200 && !str_ends_with($path, '/')) return redirect($path . '/');
            return $response;
        }
        if (preg_match('~^/(news|portfolio)/([a-z0-9-]+)/?$~D', $path, $matches) && slug_valid($matches[2])) return redirect('/en/' . $matches[1] . '/' . $matches[2] . '/');
        if (preg_match('~^/admin(?:/|$)~', $path)) {
            $html = file_get_contents($publicRoot . '/admin/index.html');
            if ($html === false) throw new RuntimeException('Missing admin shell');
            return result(200, $html, 'text/html; charset=utf-8', ['X-Robots-Tag' => 'noindex, nofollow']);
        }
        $base = rtrim($path, '/') ?: '/';
        if (in_array($base, $build['static_routes'], true)) return redirect('/en' . ($base === '/' ? '/' : $base . '/'));
        foreach ($build['static_routes'] as $route) foreach (['id', 'en'] as $locale) {
            $canonical = '/' . $locale . ($route === '/' ? '/' : rtrim($route, '/') . '/');
            if ($path !== rtrim($canonical, '/') && $path !== $canonical && $path !== $canonical . 'index.html') continue;
            if ($path !== $canonical) return redirect($canonical);
            $html = file_get_contents($publicRoot . $canonical . 'index.html');
            if ($html === false) throw new RuntimeException('Missing prerender');
            return result(200, $html, 'text/html; charset=utf-8', ['Cache-Control' => 'no-cache, max-age=0, must-revalidate']);
        }
        $notFound = file_get_contents($publicRoot . '/404.html');
        return result(404, $notFound === false ? 'Not found' : $notFound, 'text/html; charset=utf-8', ['X-Robots-Tag' => 'noindex']);
    } catch (Throwable) {
        // Deliberately exclude exception messages, request bodies and credentials.
        if (str_starts_with($request['uri'], '/api/')) return json_result(503, ['error' => 'Service temporarily unavailable.']);
        return result(503, 'Content temporarily unavailable', 'text/plain; charset=utf-8', ['Retry-After' => '60', 'X-Robots-Tag' => 'noindex']);
    }
}

function run(string $publicRoot): void
{
    ini_set('display_errors', '0');
    try {
        $config = require __DIR__ . '/config.php';
        $build = json_decode(file_get_contents(__DIR__ . '/build.json'), true, 32, JSON_THROW_ON_ERROR);
        $shell = file_get_contents(__DIR__ . '/shell.html');
        $stream = fopen('php://input', 'rb');
        $body = $stream ? stream_get_contents($stream, MAX_PAYLOAD + 1) : '';
        if ($stream) fclose($stream);
        $request = ['uri' => $_SERVER['REQUEST_URI'] ?? '/', 'method' => $_SERVER['REQUEST_METHOD'] ?? 'GET',
            'authorization' => authorization_header($_SERVER, function_exists('getallheaders') ? getallheaders() : []),
            'content_length' => $_SERVER['CONTENT_LENGTH'] ?? 0, 'body' => $body ?: ''];
        $response = handle($request, $config, $build, $shell, $publicRoot, __NAMESPACE__ . '\\http_request');
        if ($config['staging'] ?? true) $response['headers']['X-Robots-Tag'] = 'noindex, nofollow';
        // Trust the web server's HTTPS flag only, never user-supplied proxy headers.
        if (($config['https_verified'] ?? false) && ($_SERVER['HTTPS'] ?? '') === 'on') $response['headers']['Strict-Transport-Security'] = 'max-age=31536000';
    } catch (Throwable) {
        $response = result(503, 'Application configuration unavailable', 'text/plain; charset=utf-8', ['X-Robots-Tag' => 'noindex']);
    }
    http_response_code($response['status']);
    foreach ($response['headers'] as $name => $value) header($name . ': ' . $value);
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'HEAD') echo $response['body'];
}
