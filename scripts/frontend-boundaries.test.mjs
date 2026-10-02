import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import * as boundaries from './frontend-boundaries.mjs';
const { checkVerifierSource, checkPackedFiles, packedFiles } = boundaries;

const forbidden = [
  "import x from '@fairforge/api-client';", "export * from 'react';",
  "import type { X } from '../../../src/backend/contracts';",
  "import x from 'node:fs';", "const x = import('axios');",
  "const x = require('react');", "fetch('https://example.invalid');",
  "window.localStorage.getItem('x');", "const x = process.env.SECRET;",
  "const x = import(name);", "export const broken = ;", "/// <reference types=\"node\" />",
];
for (const source of forbidden) {
  test(`rejects verifier boundary violation: ${source}`, async () => {
    const dir = await mkdtemp(join(tmpdir(), 'fairforge-boundary-'));
    try {
      await writeFile(join(dir, 'invalid.ts'), source);
      assert.ok((await checkVerifierSource(dir)).length > 0);
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
}
test('accepts pure local metadata source', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'fairforge-boundary-'));
  try {
    await writeFile(join(dir, 'index.ts'), "export const metadata = { available: false } as const;");
    assert.deepEqual(await checkVerifierSource(dir), []);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test('package allowlist rejects each private artifact', () => {
  for (const path of ['.env', 'docs/private.md', 'src/backend.cs', 'vectors/seedAtRest.json', '.git/config', 'dist/private.json', '../README.md']) {
    assert.ok(checkPackedFiles([{ path }]).length > 0, path);
  }
});
test('package allowlist requires every reviewed module, declaration and notice', () => {
  assert.ok(Array.isArray(packedFiles));
  assert.ok(packedFiles.includes('dist/verification/verifier.js'));
  assert.ok(packedFiles.includes('dist/fairness/unicode/ucd16-data.generated.d.ts'));
  assert.ok(packedFiles.includes('UNICODE-LICENSE.txt'));
  assert.deepEqual(checkPackedFiles(packedFiles.map(path => ({ path }))), []);
  for (const missing of packedFiles) {
    assert.ok(checkPackedFiles(packedFiles.filter(path => path !== missing).map(path => ({ path }))).some(e => e.includes(`Missing package artifact: ${missing}`)));
  }
  assert.ok(checkPackedFiles([...packedFiles, 'src/unreviewed.ts'].map(path => ({ path }))).some(e => e.includes('Forbidden package artifact')));
});

test('rejects a real npm pack containing an unwanted fixture artifact', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'fairforge-pack-boundary-'));
  try {
    await writeFile(join(dir, 'package.json'), JSON.stringify({ name: 'fairforge-invalid-pack-fixture', version: '0.0.0', files: ['private-document.txt'] }));
    await writeFile(join(dir, 'private-document.txt'), 'Synthetic forbidden artifact; contains no private project material.');
    const [pack] = JSON.parse(execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], { cwd: dir, encoding: 'utf8' }));
    assert.ok(checkPackedFiles(pack.files).some(error => error.includes('private-document.txt')));
  } finally { await rm(dir, { recursive: true, force: true }); }
});
