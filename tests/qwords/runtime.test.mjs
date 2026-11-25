import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';
import { assertBuildEnvironment, assertNoSecrets, inlineScriptHashes, legacyApps, renderHtaccess } from '../../scripts/qwords-lib.mjs';

test('artifact scanner and build guard reject server credentials', () => {
  const privileged = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from('{"role":"service_role"}').toString('base64url')}.signature`;
  for (const value of ['sb_secret_test-value', privileged]) {
    assert.throws(() => assertNoSecrets(value));
  }
  assert.throws(() => assertNoSecrets('accidental provider value', ['provider value']));
  assert.throws(() => assertBuildEnvironment({ VITE_DEEPL_AUTH_KEY: 'test-value' }));
  assert.throws(() => assertBuildEnvironment({ VITE_DB_PASSWORD: 'test-value' }));
});
test('CSP hashes emitted executable scripts and excludes data/external scripts', () => {
  const hashes = inlineScriptHashes('<script>console.log(1)</script><script type="application/ld+json">{}</script><script src="/app.js"></script>');
  assert.equal(hashes.length, 1);
  assert.match(hashes[0], /^'sha256-[A-Za-z0-9+/]+=*'$/);
  assert.notDeepEqual(hashes, inlineScriptHashes('<script>console.log(2)</script>'));
  const template = readFileSync(new URL('../../server/qwords/.htaccess', import.meta.url), 'utf8');
  const rules = renderHtaccess(template, hashes, { staging: true });
  assert.match(rules, /connect-src 'self';/);
  assert.doesNotMatch(rules, /supabase\.co/);
});
const php = process.env.PHP_BINARY || 'php';
const available = spawnSync(php, ['-v']).status === 0;
const required = process.env.QWORDS_REQUIRE_PHP === 'true';
test('PHP runtime regression checks', { skip: available || required ? false : 'PHP CLI unavailable; run on staging/CI' }, async (t) => {
  assert.ok(available, 'PHP runtime integration is required but PHP CLI is unavailable');
  const directory = mkdtempSync(join(tmpdir(), 'visitiga-qwords-'));
  try {
    const checks = JSON.parse(execFileSync(php, ['tests/qwords/runtime-check.php', directory], { encoding: 'utf8' }));
    for (const check of checks) await t.test(check.name, () => assert.equal(check.passed, true));
  } finally {
    assert.ok(resolve(directory).startsWith(resolve(tmpdir(), 'visitiga-qwords-')));
    rmSync(directory, { recursive: true, force: true });
  }
});
test('legacy allowlist defaults closed and rejects reserved paths and regex fragments', () => {
  assert.deepEqual(legacyApps(), []);
  assert.deepEqual(legacyApps('uai, beta'), ['beta', 'uai']);
  for (const value of ['backup', 'cgi-bin', 'beta,beta', 'beta|admin', '../lms']) assert.throws(() => legacyApps(value));
});
