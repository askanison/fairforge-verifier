import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { packedFiles } from './frontend-boundaries.mjs';

test('actual installed tarball imports independently and matches every reviewed file digest', () => {
  const temporary = mkdtempSync(join(tmpdir(), 'fairforge-installed-pack-test-'));
  try {
    const report = join(temporary, 'report.json');
    execFileSync('node', ['scripts/frontend-pack.mjs', '--report', report], { encoding: 'utf8' });
    const result = JSON.parse(readFileSync(report, 'utf8'));
    assert.equal(result.independentImport, true);
    assert.deepEqual(Object.keys(result.files).sort(), [...packedFiles].sort());
    assert.ok(Object.values(result.files).every(hash => /^[a-f0-9]{64}$/.test(hash)));
    assert.match(result.tarballSha256, /^[a-f0-9]{64}$/);
  } finally { rmSync(temporary, { recursive: true, force: true }); }
});
