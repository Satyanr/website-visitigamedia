import { createHash } from 'node:crypto';
import { readdir, readFile, lstat } from 'node:fs/promises';
import { join, relative } from 'node:path';

export function inlineScriptHashes(html) {
  return [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
    .filter(([, attributes]) => !/\bsrc\s*=|application\/(?:ld\+)?json/i.test(attributes))
    .map(([, , source]) => `'sha256-${createHash('sha256').update(source).digest('base64')}'`);
}

export function assertPublicKey(key) {
  if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) return;
  try {
    const parts = key.split('.');
    if (parts.length === 3 && JSON.parse(Buffer.from(parts[1], 'base64url').toString()).role === 'anon') return;
  } catch { /* Fail closed without printing key material. */ }
  throw new Error('Gunakan Supabase publishable key atau legacy anon JWT; privileged key ditolak.');
}

export function assertBuildEnvironment(env) {
  for (const name of Object.keys(env)) {
    if (/^VITE_.*(?:SECRET|SERVICE_ROLE|DEEPL|AUTH_KEY|PRIVATE)/i.test(name) && env[name]) throw new Error(`Variabel frontend terlarang: ${name}`);
  }
  if (env.VITE_SUPABASE_PUBLISHABLE_KEY) assertPublicKey(env.VITE_SUPABASE_PUBLISHABLE_KEY);
}

export function legacyApps(value = '') {
  const apps = value === '' ? [] : value.split(',').map((app) => app.trim());
  const candidates = ['beta', 'brochure', 'info', 'lms', 'smart-classroom', 'uai'];
  if (apps.some((app) => !candidates.includes(app)) || new Set(apps).size !== apps.length) {
    throw new Error('QWORDS_LEGACY_APPS harus berisi nama folder kandidat yang terverifikasi, tanpa duplikat.');
  }
  return apps.sort();
}

export function renderHtaccess(template, hashes, build) {
  const apps = legacyApps((build.legacy_apps ?? []).join(',')).join('|') || '(?!)';
  const scope = `"expr=%{REQUEST_URI} !~ m#^/(?:(?:${apps})(?:/|$)|\\.well-known/acme-challenge/)#"`;
  const supabase = build.supabase_url;
  if (supabase && !/^https:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(supabase)) throw new Error('Origin Supabase tidak valid untuk CSP.');
  const headers = supabase ? template.replace(/\b(img-src|media-src|connect-src) ([^;]*);/g, (_, directive, sources) => {
    const realtime = directive === 'connect-src' ? ` ${supabase.replace(/^https:/i, 'wss:')}` : '';
    return `${directive} ${sources} ${supabase}${realtime};`;
  }) : template;
  return headers.replaceAll('__QWORDS_LEGACY_APPS__(?!)', apps)
    .replace(/script-src 'self'[^;]*;/, `script-src 'self' ${hashes.join(' ')};`)
    .replace(/^([ \t]+Header (?:always )?set .+)$/gm, `$1 ${scope}`)
    + (build.staging ? '\n<IfModule mod_headers.c>\n  Header always set X-Robots-Tag "noindex, nofollow"\n</IfModule>\n' : '');
}

export function assertNoSecrets(text, secrets = []) {
  if (/sb_secret_[A-Za-z0-9_-]+/.test(text)) throw new Error('Privileged key ditemukan pada artifact.');
  for (const token of text.match(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g) ?? []) {
    try {
      if (JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).role === 'service_role') throw new Error('privileged');
    } catch (error) { if (error.message === 'privileged') throw new Error('Service role JWT ditemukan pada artifact.'); }
  }
  if (secrets.some((secret) => secret && text.includes(secret))) throw new Error('Server secret ditemukan pada artifact.');
}

export async function listFiles(root) {
  const files = [];
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      const info = await lstat(path);
      if (info.isSymbolicLink()) throw new Error('Symlink tidak boleh masuk artifact.');
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile()) files.push(path);
    }
  }
  await walk(root);
  return files.sort();
}

export async function artifactManifest(root, secrets = []) {
  const files = await listFiles(root);
  const manifest = [];
  for (const path of files) {
    const body = await readFile(path);
    assertNoSecrets(body.toString('utf8'), secrets);
    manifest.push({ path: relative(root, path).replaceAll('\\', '/'), bytes: body.length, sha256: createHash('sha256').update(body).digest('hex') });
  }
  return manifest;
}
