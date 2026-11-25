import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';
import { assertBuildEnvironment, assertNoSecrets, assertPublicKey, inlineScriptHashes } from '../../scripts/qwords-lib.mjs';
import { publicSupabaseHeaders } from '../../scripts/supabase-headers.mjs';

test('public Supabase headers do not replace user JWT handling', () => {
  assert.deepEqual(publicSupabaseHeaders('sb_publishable_test'), { apikey: 'sb_publishable_test' });
  assert.equal(publicSupabaseHeaders('legacy-anon').Authorization, 'Bearer legacy-anon');
});
test('artifact scanner and build guard reject server credentials', () => {
  const privileged = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from('{"role":"service_role"}').toString('base64url')}.signature`;
  for (const value of ['sb_secret_test-value', privileged]) {
    assert.throws(() => assertNoSecrets(value));
    assert.throws(() => assertPublicKey(value));
  }
  assert.throws(() => assertNoSecrets('accidental provider value', ['provider value']));
  assert.throws(() => assertBuildEnvironment({ VITE_DEEPL_AUTH_KEY: 'test-value' }));
  assert.doesNotThrow(() => assertPublicKey('sb_publishable_test-only'));
});
test('CSP hashes emitted executable scripts and excludes data/external scripts', () => {
  const hashes = inlineScriptHashes('<script>console.log(1)</script><script type="application/ld+json">{}</script><script src="/app.js"></script>');
  assert.equal(hashes.length, 1);
  assert.match(hashes[0], /^'sha256-[A-Za-z0-9+/]+=*'$/);
  assert.notDeepEqual(hashes, inlineScriptHashes('<script>console.log(2)</script>'));
});
const php = process.env.PHP_BINARY || 'php';
const available = spawnSync(php, ['-v']).status === 0;
test('PHP runtime regression checks', { skip: available ? false : 'PHP CLI unavailable; run on staging/CI' }, async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'visitiga-qwords-'));
  try {
    const checks = JSON.parse(execFileSync(php, ['tests/qwords/runtime-check.php', directory], { encoding: 'utf8' }));
    for (const check of checks) await t.test(check.name, () => assert.equal(check.passed, true));
  } finally {
    assert.ok(resolve(directory).startsWith(resolve(tmpdir(), 'visitiga-qwords-')));
    rmSync(directory, { recursive: true, force: true });
  }
});
