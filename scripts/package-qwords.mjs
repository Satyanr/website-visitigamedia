import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import process from 'node:process';
import { loadEnv } from 'vite';
import { artifactManifest, assertBuildEnvironment, inlineScriptHashes, listFiles, renderHtaccess } from './qwords-lib.mjs';
import { localizedRoute, SEO_LANGUAGES, STATIC_ROUTES } from './seo-build-lib.mjs';

const root = process.cwd();
const source = join(root, 'dist-qwords');
const destination = resolve(root, 'artifacts/qwords');
// This script only deletes its own fixed generated directory inside the workspace.
const outputRoot = dirname(destination);
await mkdir(outputRoot, { recursive: true });
if (await realpath(outputRoot) !== join(await realpath(root), 'artifacts')) throw new Error('Unsafe package destination.');
const env = { ...loadEnv('production', root, ''), ...process.env };
assertBuildEnvironment(env);
const secrets = Object.entries(env).filter(([name]) => /(?:DEEPL_AUTH_KEY|SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEY|QWORDS_EXPORT_KEY|QWORDS_APP_SECRET|DB_PASSWORD|DATABASE_PASSWORD)/i.test(name))
  .map(([, value]) => value).filter(Boolean);
const build = JSON.parse(await readFile(join(source, 'qwords-build.json'), 'utf8'));
if (build.backend !== 'mysql' || typeof build.staging !== 'boolean' || (!build.staging && (build.offline || build.site_url !== 'https://visitigamedia.com'))) {
  throw new Error('Mode produksi tidak valid pada build metadata.');
}
await artifactManifest(source, secrets); // Scan BEFORE creating any uploadable package.
const requiredHtml = new Set(['index.html', '404.html', 'admin/index.html',
  ...STATIC_ROUTES.flatMap((route) => SEO_LANGUAGES.map((lang) => localizedRoute(route, lang).slice(1) + 'index.html'))]);
const staticAsset = /^(?:assets\/.+\.(?:css|js|woff2?|ttf|eot|png|jpe?g|gif|webp|avif|svg|ico)|(?:installation-icons|news|portfolio|products|videos)\/.+\.(?:png|jpe?g|gif|webp|avif|svg|ico|mp4|webm|pdf)|(?:hero-(?:640|960|1600)|installation-area-map|social-preview|video-cover|visitiga-media-logo)\.(?:webp|png))$/i;
const publicFiles = [];
for (const path of await listFiles(source)) {
  const name = relative(source, path).replaceAll('\\', '/');
  if (/^(?:_headers|_redirects|_routes\.json|portfolio-edge-config\.json|portfolio-fallback\.html|sitemap\.xml|robots\.txt|qwords-build\.json)$/.test(name)) continue;
  if (/^(?:id|en)\/(?:news|portfolio)\/[^/]+\//.test(name)) continue;
  if (!requiredHtml.delete(name) && (!staticAsset.test(name) || /(?:^|\/)\.|\.(?:php[0-9]*|phar|phtml)(?:[./]|$)/i.test(name))) {
    throw new Error(`Jenis output publik tidak diizinkan: ${name}`);
  }
  publicFiles.push({ path, name });
}
if (requiredHtml.size) throw new Error('Ada snapshot HTML wajib yang belum tersedia.');
await rm(destination, { recursive: true, force: true });
const publicRoot = join(destination, 'public_html');
const privateRoot = join(destination, 'qwords-private');
await mkdir(privateRoot, { recursive: true });
await mkdir(publicRoot, { recursive: true });
for (const { path, name } of publicFiles) {
  const target = join(publicRoot, name);
  await mkdir(dirname(target), { recursive: true });
  await cp(path, target);
}
await cp(join(root, 'server/qwords/runtime.php'), join(privateRoot, 'runtime.php'));
const privateFiles = {
  app: ['api.php','content.php','database.php','forms.php','media.php','schema.php','schema.json','security.php'],
  database: ['001_initial.sql','002_report_index.sql'],
  tools: ['admin-sql.php','content-export.php','import.php','maintenance.php','private-cli.php'],
};
for (const [folder, files] of Object.entries(privateFiles)) {
  await mkdir(join(privateRoot, folder));
  for (const file of files) await cp(join(root, 'server/qwords', folder, file), join(privateRoot, folder, file));
}
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
const headers = renderHtaccess(await readFile(join(root, 'server/qwords/.htaccess'), 'utf8'), [...hashes], build);
await writeFile(join(publicRoot, '.htaccess'), headers);
const manifest = await artifactManifest(destination, secrets);
await writeFile(join(destination, 'manifest.json'), JSON.stringify({ build, files: manifest }, null, 2));
const zip = `${destination}-${build.staging ? 'staging' : 'production'}.zip`;
const tempZip = `${zip}.tmp`;
try {
  execFileSync(process.env.PHP_BINARY || 'php', ['scripts/qwords-zip.php', 'create', tempZip, destination], { stdio: 'inherit' });
  await rename(tempZip, zip);
} finally {
  await rm(tempZip, { force: true });
}
const folders = new Set();
for (const { path } of manifest) {
  for (let folder = dirname(path); folder !== '.'; folder = dirname(folder)) folders.add(folder);
}
const zipBody = await readFile(zip);
const uncompressed = manifest.reduce((bytes, file) => bytes + file.bytes, 0) + (await readFile(join(destination, 'manifest.json'))).length;
const inodeCount = manifest.length + folders.size;
const report = {
  build, deployFiles: manifest.length, deployDirectories: folders.size, deployInodes: inodeCount,
  archiveFiles: manifest.length + 1, archiveUncompressedBytes: uncompressed, zipBytes: zipBody.length,
  zipSha256: createHash('sha256').update(zipBody).digest('hex'),
  additionalLocalSizeForOneEquivalentRollbackCopyBytes: uncompressed,
  additionalLocalInodesForOneEquivalentRollbackCopy: inodeCount,
  largestFiles: [...manifest].sort((a, b) => b.bytes - a.bytes).slice(0, 10).map(({ path, bytes }) => ({ path, bytes })),
};
await writeFile(`${zip}.report.json`, JSON.stringify(report, null, 2) + '\n');
console.log(`[qwords] ${zip}: ${manifest.length} file deploy, ${folders.size} direktori, ~${inodeCount} inode, ${uncompressed} byte uncompressed, ZIP ${zipBody.length} byte.`);
console.log(`[qwords] Satu salinan rollback sebesar rilis ini memerlukan ~${inodeCount} inode dan hingga ${uncompressed} byte sebelum overhead. Lihat laporan JSON untuk SHA-256 dan file terbesar.`);
if (build.offline) console.warn('[qwords] OFFLINE STAGING: artifact ini memakai fallback; belum layak untuk produksi.');
