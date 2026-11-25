import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import process from 'node:process';
import { loadEnv } from 'vite';
import { assertBuildEnvironment, legacyApps } from './qwords-lib.mjs';
import { STATIC_ROUTES } from './seo-build-lib.mjs';

const root = process.cwd();
const env = { ...loadEnv('production', root, ''), ...process.env };
assertBuildEnvironment(env);
const staging = env.QWORDS_STAGING !== 'false';
const offline = env.QWORDS_ALLOW_OFFLINE === 'true';
const legacy = legacyApps(env.QWORDS_LEGACY_APPS);
if (env.QWORDS_STAGING && !['true', 'false'].includes(env.QWORDS_STAGING)) throw new Error('QWORDS_STAGING harus true atau false.');
if (offline && !staging) throw new Error('Build offline hanya diizinkan untuk staging.');
if (!/^https:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(env.VITE_SITE_URL || '')) throw new Error('Qwords memerlukan VITE_SITE_URL origin HTTPS eksplisit.');
if (!staging && env.VITE_SITE_URL !== 'https://visitigamedia.com') throw new Error('Origin produksi wajib https://visitigamedia.com.');
const hostname = new URL(env.VITE_SITE_URL).hostname.replace(/\.$/, '');
if (staging && ['visitigamedia.com', 'www.visitigamedia.com'].includes(hostname)) throw new Error('Gunakan origin HTTPS staging terpisah.');
if (!offline && !env.QWORDS_CONTENT_EXPORT && !(env.QWORDS_CONTENT_API && env.QWORDS_EXPORT_KEY)) {
  throw new Error('Gunakan QWORDS_CONTENT_EXPORT atau QWORDS_CONTENT_API dan QWORDS_EXPORT_KEY.');
}
Object.assign(env, { BUILD_OUTPUT_DIR: 'dist-qwords', QWORDS_STATIC_ONLY: 'true', VITE_NOINDEX: String(staging), SEO_REQUIRE_NEWS: String(!offline), SEO_OFFLINE: String(offline) });

async function run(script, args) {
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], { cwd: root, env, stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`Build step failed (${code}).`)));
  });
}
await run(join(root, 'node_modules/vite/bin/vite.js'), ['build', '--outDir', 'dist-qwords']);
await run(join(root, 'scripts/prerender.mjs'), []);
await mkdir(join(root, 'dist-qwords'), { recursive: true });
await writeFile(join(root, 'dist-qwords/qwords-build.json'), JSON.stringify({
  site_url: env.VITE_SITE_URL, backend: 'mysql', staging, offline,
  built_at: new Date().toISOString(), static_routes: STATIC_ROUTES, legacy_apps: legacy,
}, null, 2));
console.log('[qwords] Build selesai. Jalankan npm run package:qwords.');
