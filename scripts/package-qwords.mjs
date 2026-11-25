import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import process from 'node:process';
import { loadEnv } from 'vite';
import { artifactManifest, assertBuildEnvironment, inlineScriptHashes, listFiles } from './qwords-lib.mjs';

const root = process.cwd();
const source = join(root, 'dist-qwords');
const destination = resolve(root, 'artifacts/qwords');
// This script only deletes its own fixed generated directory inside the workspace.
if (destination !== join(resolve(root), 'artifacts', 'qwords')) throw new Error('Unsafe package destination.');
const env = { ...loadEnv('production', root, ''), ...process.env };
assertBuildEnvironment(env);
const secrets = Object.entries(env).filter(([name]) => /(?:DEEPL_AUTH_KEY|SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEY)/i.test(name)).map(([, value]) => value).filter(Boolean);
const build = JSON.parse(await readFile(join(source, 'qwords-build.json'), 'utf8'));
const files = await listFiles(source);
await artifactManifest(source, secrets); // Scan BEFORE creating any uploadable package.
await rm(destination, { recursive: true, force: true });
const publicRoot = join(destination, 'public_html');
const privateRoot = join(destination, 'qwords-private');
await mkdir(privateRoot, { recursive: true });
await mkdir(publicRoot, { recursive: true });
for (const path of files) {
  const name = relative(source, path).replaceAll('\\', '/');
  if (/^(?:_headers|_redirects|_routes\.json|portfolio-edge-config\.json|portfolio-fallback\.html|sitemap\.xml|robots\.txt|qwords-build\.json)$/.test(name)) continue;
  // Runtime owns detail pages. Do not ship stale detail snapshots at all.
  if (/^(?:id|en)\/(?:news|portfolio)\/[^/]+\//.test(name)) continue;
  if (/(?:^|\/)(?:\.[^/]+|node_modules|src|server|supabase|functions)(?:\/|$)|\.(?:map|sql|ya?ml|log|bak|php)$/i.test(name)) throw new Error('Development/internal file in build output.');
  const target = join(publicRoot, name);
  await mkdir(dirname(target), { recursive: true });
  await cp(path, target);
}
await cp(join(root, 'server/qwords/runtime.php'), join(privateRoot, 'runtime.php'));
await cp(join(root, 'server/qwords/config.example.php'), join(privateRoot, 'config.example.php'));
await cp(join(source, 'portfolio-fallback.html'), join(privateRoot, 'shell.html'));
await writeFile(join(privateRoot, 'build.json'), JSON.stringify(build, null, 2));
await cp(join(root, 'server/qwords/entry.php'), join(publicRoot, '_qwords.php'));
const hashes = new Set(inlineScriptHashes(await readFile(join(privateRoot, 'shell.html'), 'utf8')));
for (const path of await listFiles(publicRoot)) {
  if (path.endsWith('.html')) for (const hash of inlineScriptHashes(await readFile(path, 'utf8'))) hashes.add(hash);
}
// Vite reformats the inline hero preload script. Hash the final emitted bytes,
// instead of copying the Cloudflare source hash which no longer matches them.
const headers = (await readFile(join(root, 'server/qwords/.htaccess'), 'utf8'))
  .replace(/script-src 'self'[^;]*;/, `script-src 'self' ${[...hashes].join(' ')};`);
await writeFile(join(publicRoot, '.htaccess'), headers + (build.staging ? '\n<IfModule mod_headers.c>\n  Header always set X-Robots-Tag "noindex, nofollow"\n</IfModule>\n' : ''));
await cp(join(root, 'DEPLOY_QWORDS.md'), join(destination, 'DEPLOY_QWORDS.md'));
const manifest = await artifactManifest(destination, secrets);
await writeFile(join(destination, 'manifest.json'), JSON.stringify({ build, files: manifest }, null, 2));
console.log(`[qwords] Paket siap: artifacts/qwords (${manifest.length} file). Upload public_html dan qwords-private sesuai dokumentasi.`);
if (build.offline) console.warn('[qwords] OFFLINE STAGING: artifact ini memakai fallback; belum layak untuk produksi.');
