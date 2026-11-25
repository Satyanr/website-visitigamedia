import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';
import { renderHtaccess } from '../../scripts/qwords-lib.mjs';

const windows = process.platform === 'win32';
const binary = process.env.QWORDS_APACHE_BINARY || (windows ? 'C:/xampp/apache/bin/httpd.exe' : '/usr/sbin/apache2');
const available = existsSync(binary);
const required = process.env.QWORDS_REQUIRE_APACHE === 'true';
test('real Apache .htaccess and PHP integration', { skip: available || required ? false : 'Apache unavailable; server compatibility unverified' }, async (t) => {
  assert.ok(available, 'Apache integration is required but the binary is unavailable');
  await mkdir('.qwords-test', { recursive: true });
  const directory = await mkdtemp(resolve('.qwords-test/apache-'));
  const publicRoot = join(directory, 'public_html');
  const path = (value) => value.replaceAll('\\', '/');
  const apacheRoot = windows ? path(resolve(binary, '../..')) : '/etc/apache2';
  const moduleRoot = windows ? 'modules' : '/usr/lib/apache2/modules';
  const phpModule = windows ? 'C:/xampp/php/php8apache2_4.dll' : process.env.QWORDS_APACHE_PHP_MODULE ||
    join(moduleRoot, (await readdir(moduleRoot)).find((file) => /^libphp.*\.so$/.test(file)) || 'libphp.so');
  let child;
  try {
    for (const name of ['id/about', 'id/news/current-news', 'admin', 'assets', '.git', '.well-known/acme-challenge', 'beta', 'lms', 'backup', 'wp-content/uploads', 'wp-includes']) {
      await mkdir(join(publicRoot, name), { recursive: true });
    }
    const template = await readFile('server/qwords/.htaccess', 'utf8');
    await writeFile(join(publicRoot, '.htaccess'), renderHtaccess(template, [], { legacy_apps: [] }));
    await writeFile(join(publicRoot, 'beta/.htaccess'), 'DirectoryIndex index.php\nRewriteEngine On\nRewriteRule ^deep/?$ index.php [L]\n');
    await writeFile(join(publicRoot, 'lms/.htaccess'), 'RewriteEngine On\nRewriteRule ^deep/?$ index.php [L]\n');
    for (const file of ['index.php', 'wp-login.php', 'beta/index.php', 'lms/index.php', 'wp-includes/legacy.php']) {
      await writeFile(join(publicRoot, file), "<?php echo 'LEGACY PHP';");
    }
    await writeFile(join(publicRoot, 'backup/index.html'), 'BACKUP');
    await writeFile(join(publicRoot, 'wp-content/uploads/old.pdf'), 'OLD MEDIA');
    await writeFile(join(publicRoot, '.well-known/acme-challenge/Test_Token-1'), 'ACME');
    await writeFile(join(publicRoot, 'id/about/index.html'), '<h1>Static about</h1>'.repeat(100));
    await writeFile(join(publicRoot, 'id/news/current-news/index.html'), 'STALE MUST NEVER BE SERVED');
    await writeFile(join(publicRoot, 'admin/index.html'), '<h1>Admin login</h1>');
    await writeFile(join(publicRoot, '404.html'), '<h1>Not found</h1>');
    await writeFile(join(publicRoot, 'sitemap.xml'), 'STALE SITEMAP');
    await writeFile(join(publicRoot, '.env'), 'sentinel');
    await writeFile(join(publicRoot, '.git/config'), 'sentinel');
    await writeFile(join(publicRoot, 'backup.zip'), 'sentinel');
    await writeFile(join(publicRoot, 'internal.map'), 'sentinel');
    await writeFile(join(publicRoot, 'migration.sql'), 'sentinel');
    await writeFile(join(publicRoot, 'assets/app-abcdefgh.js'), 'console.log("test");');
    await writeFile(join(publicRoot, '_qwords.php'), `<?php
require '${path(resolve('server/qwords/runtime.php'))}';
$config = ['site_url'=>'https://stage.example.test','supabase_url'=>'https://db.supabase.co','supabase_publishable_key'=>'sb_publishable_test_only','staging'=>false,'legacy_redirects'=>['/old-wordpress/'=>'/id/about/'],'migration_routes'=>[['source'=>'/index.php?p=42','target'=>'/id/about/','status'=>301,'evidence'=>'test fixture','preserve_query'=>['utm_source']]]];
$build = ['site_url'=>$config['site_url'],'supabase_url'=>$config['supabase_url'],'staging'=>false,'static_routes'=>['/','/about']];
$tables = json_decode(file_get_contents('${path(resolve('tests/qwords/browser-data.json'))}'),true);
$http = static function($url,$headers) use($tables) { if(str_contains($url,'/auth/v1/user')) return ['status'=>200,'body'=>'{"id":"admin-1","app_metadata":{"role":"admin"}}']; parse_str(parse_url($url,PHP_URL_QUERY)??'', $query); $rows=$tables[basename(parse_url($url,PHP_URL_PATH))]??[]; if(isset($query['slug']) && $query['slug']!=='eq.test-news' && $query['slug']!=='eq.current-news') $rows=[]; if(isset($query['slug']) && $query['slug']==='eq.current-news' && $rows) $rows[0]['slug']='current-news'; return ['status'=>200,'body'=>json_encode($rows)]; };
$config['_read'] = static function ($table,$select,$filters) use ($http) { return json_decode($http('https://fixture.example.test/rest/v1/'.$table.'?'.http_build_query($filters),[])['body'],true); };
$shell='<!doctype html><html><head><title>Shell</title></head><body><div id="root"></div></body></html>';
$r=\\Visitiga\\Qwords\\handle(['uri'=>$_SERVER['REQUEST_URI'],'method'=>$_SERVER['REQUEST_METHOD'],'body'=>file_get_contents('php://input'),'origin'=>$_SERVER['HTTP_ORIGIN']??''],$config,$build,$shell,__DIR__,$http);
http_response_code($r['status']); foreach($r['headers'] as $k=>$v) header($k.': '.$v); echo $r['body'];`);
    const config = `ServerRoot "${apacheRoot}"
Listen 127.0.0.1:4187
ServerName 127.0.0.1
PidFile "${path(join(directory, 'httpd.pid'))}"
ErrorLog "${path(join(directory, 'error.log'))}"
${windows ? '' : `LoadModule mpm_prefork_module ${moduleRoot}/mod_mpm_prefork.so
User www-data
Group www-data`}
${['authz_core', 'dir', 'mime', 'headers', 'rewrite', 'filter', 'deflate'].map((name) => `LoadModule ${name}_module ${moduleRoot}/mod_${name}.so`).join('\n')}
${windows ? 'LoadFile "C:/xampp/php/php8ts.dll"\nPHPINIDir "C:/xampp/php"' : ''}
LoadModule php_module "${path(phpModule)}"
TypesConfig "${windows ? 'conf/mime.types' : '/etc/mime.types'}"
DocumentRoot "${path(publicRoot)}"
<Directory "${path(publicRoot)}">
  AllowOverride All
  Require all granted
</Directory>
<FilesMatch "\\.php$">
  SetHandler application/x-httpd-php
</FilesMatch>
`;
    const configFile = join(directory, 'httpd.conf');
    await writeFile(configFile, config);
    const syntax = spawnSync(binary, ['-t', '-f', path(configFile)], { encoding: 'utf8', windowsHide: true });
    assert.equal(syntax.status, 0, syntax.stderr);
    child = spawn(binary, ['-X', '-f', path(configFile)], { stdio: 'ignore', windowsHide: true });
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      if (child.exitCode !== null) throw new Error(await readFile(join(directory, 'error.log'), 'utf8'));
      try { await fetch('http://127.0.0.1:4187/robots.txt'); ready = true; break; } catch { /* Starting. */ }
      await new Promise((done) => setTimeout(done, 100));
    }
    assert.ok(ready, 'Apache did not start');
    const get = (route, options = {}) => fetch(`http://127.0.0.1:4187${route}`, { redirect: 'manual', ...options });
    await t.test('ACME, WordPress quarantine and child application rewrite precedence', async () => {
      assert.equal(await (await get('/.well-known/acme-challenge/Test_Token-1')).text(), 'ACME');
      assert.equal((await get('/.well-known/anything-else')).status, 403);
      assert.equal((await get('/beta/deep')).status, 404);
      assert.equal((await get('/beta/index.php')).status, 403);
      for (const route of ['/wp-login.php', '/wp-includes/legacy.php', '/backup/index.html', '/_qwords.php'])
        assert.equal((await get(route)).status, 403, route);
      assert.equal((await get('/index.php?p=12')).status, 404);
      const oldPost = await get('/index.php?p=42&utm_source=fixture');
      assert.equal(oldPost.status, 301);
      assert.equal(oldPost.headers.get('location'), '/id/about/?utm_source=fixture');
      assert.equal((await get(oldPost.headers.get('location'))).status, 200);
      assert.equal((await get('/wp-content/uploads/old.pdf')).status, 404);
      await writeFile(join(publicRoot, '.htaccess'), renderHtaccess(template, [], { legacy_apps: ['beta'] }));
      for (const route of ['/beta/', '/beta/deep', '/beta/index.php']) {
        const response = await get(route);
        assert.equal(response.status, 200, route);
        assert.equal(await response.text(), 'LEGACY PHP');
        assert.equal(response.headers.get('content-security-policy'), null);
      }
      assert.equal((await get('/lms/deep')).status, 404);
    });
    await t.test('prerender, canonical redirect and gzip', async () => {
      const response = await get('/id/about/', { headers: { 'Accept-Encoding': 'gzip' } });
      assert.equal(response.status, 200);
      assert.match(await response.text(), /Static about/);
      assert.match(response.headers.get('cache-control'), /must-revalidate/);
      assert.equal(response.headers.get('content-encoding'), 'gzip');
      assert.equal(new URL((await get('/id/about')).headers.get('location'), 'http://127.0.0.1:4187').pathname, '/id/about/');
    });
    await t.test('dynamic handlers override existing stale files', async () => {
      const response = await get('/id/news/current-news/');
      assert.equal(response.status, 200);
      assert.doesNotMatch(await response.text(), /STALE/);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.equal(response.headers.get('x-litespeed-cache-control'), 'no-cache');
      const xml = await get('/sitemap.xml');
      assert.equal(xml.status, 200);
      assert.doesNotMatch(await xml.text(), /STALE/);
    });
    await t.test('admin deep links, 301 mapping and 404', async () => {
      for (const route of ['/admin', '/admin/login', '/admin/news']) {
        const initial = await get(route);
        if (initial.status === 301) {
          assert.equal(new URL(initial.headers.get('location'), 'http://127.0.0.1:4187').pathname, '/admin/');
          assert.equal((await get('/admin/')).status, 200);
        } else assert.equal(initial.status, 200);
      }
      assert.equal((await get('/old-wordpress/')).headers.get('location'), '/id/about/');
      assert.equal((await get('/id/news/missing/')).status, 404);
      assert.equal((await get('/en/unknown/')).status, 404);
    });
    await t.test('protected files and secret paths denied', async () => {
      for (const route of ['/.env', '/.git/config', '/backup.zip', '/internal.map', '/migration.sql', '/qwords-private/config.php', '/server/qwords/runtime.php', '/src/main.tsx', '/portfolio-edge-config.json']) assert.equal((await get(route)).status, 403, route);
    });
    await t.test('security headers, immutable assets and API authorization', async () => {
      const response = await get('/assets/app-abcdefgh.js');
      assert.equal(response.status, 200);
      assert.match(response.headers.get('cache-control'), /immutable/);
      assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
      assert.equal(response.headers.get('x-frame-options'), 'DENY');
      assert.match(response.headers.get('content-security-policy'), /frame-ancestors 'none'/);
      assert.equal(response.headers.get('strict-transport-security'), null);
      assert.equal((await get('/api/translate-content', { method: 'POST', headers: { Origin: 'https://stage.example.test' }, body: '{}' })).status, 401);
    });
    await t.test('production entry fails closed without private config and serves static pages with it', async () => {
      const privateRoot = join(directory, 'qwords-private');
      await mkdir(privateRoot);
      await cp('server/qwords/runtime.php', join(privateRoot, 'runtime.php'));
      await cp('server/qwords/app', join(privateRoot, 'app'), { recursive: true });
      await cp('server/qwords/entry.php', join(publicRoot, '_qwords.php'));
      await writeFile(join(privateRoot, 'shell.html'), '<html><head></head><body><div id="root"></div></body></html>');
      await writeFile(join(privateRoot, 'build.json'), JSON.stringify({ site_url: 'https://stage.example.test', supabase_url: 'https://db.supabase.co', staging: true, static_routes: ['/', '/about'] }));
      const missing = await get('/id/about/');
      assert.equal(missing.status, 503);
      assert.doesNotMatch(await missing.text(), /Warning|config\.php/);
      await writeFile(join(privateRoot, 'config.php'), `<?php return ['site_url'=>'https://stage.example.test','supabase_url'=>'https://db.supabase.co','supabase_publishable_key'=>'sb_publishable_test_only','staging'=>true,'https_verified'=>true];`);
      const configured = await get('/id/about/', { headers: { 'X-Forwarded-Proto': 'https' } });
      assert.equal(configured.status, 200);
      assert.equal(configured.headers.get('x-robots-tag'), 'noindex, nofollow');
      assert.equal(configured.headers.get('strict-transport-security'), null);
    });
  } finally {
    if (child && child.exitCode === null) {
      child.kill();
      await new Promise((done) => child.once('exit', done));
    }
    assert.ok(directory.startsWith(resolve('.qwords-test') + sep));
    await rm(directory, { recursive: true, force: true });
  }
});
