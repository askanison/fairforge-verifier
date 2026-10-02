import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { loadPublicVectors, preparePublicVectors } from './public-vectors.ts';

const temporaryDirectory = mkdtempSync(join(tmpdir(), 'fairforge-public-vectors-'));
// Register before realpath/exporter/inventory setup, all of which can throw.
process.on('exit', () => rmSync(temporaryDirectory, { recursive: true, force: true }));
let output: string;
try {
  output = join(realpathSync(temporaryDirectory), 'projection');
  preparePublicVectors(output);
} catch (error) {
  rmSync(temporaryDirectory, { recursive: true, force: true });
  throw error; // Preserve the exporter diagnostic; do not obscure it with a subsequent read.
}

const pfCounts = { encodingVectors: 21, nextIntVectors: 9, minesShuffleSyntheticVectors: 1, clientSeedValidationVectors: 14, diceVectors: 5, minesVectors: 5, negativeVectors: 5, payloadVectors: 57 };
const gmCounts = { amountVectors: 18, mathProfiles: 6, diceMultiplierVectors: 29, diceTableDigests: 3, minesTables: 3, payoutVectors: 15, availabilityVectors: 19, minesSummaryVectors: 3, autoBetVectors: 10, payloadVectors: 66 };

// Inventory and named execution, not outcome or payout conformance.
test('all eight public PF and eleven GM groups execute with every P/PM case once', () => {
  const documents = loadPublicVectors(output);
  let count = 0;
  for (const [file, expected] of [['pfge-pf-v1-test-vectors.json', pfCounts], ['pfge-gm-v1-test-vectors.json', gmCounts]] as const) {
    const doc = documents[file]!;
    for (const [group, expectedCount] of Object.entries(expected)) {
      const entries = doc[group] as Record<string, unknown>[];
      assert.equal(entries.length, expectedCount, group);
      assert.equal(new Set(entries.map(v => v.id ?? `${v.mathProfileId}/${v.mathProfileVersion}`)).size, expectedCount, group);
      count += entries.length;
    }
  }
  assert.equal(count, 289);
  assert.equal((documents['pfge-gm-v1-test-vectors.json']!.acceptanceChecks as string[]).length, 4);
});

for (const mutation of ['missing', 'duplicate', 'missingId', 'unknown', 'S-01', 'tampered']) {
  test(`public inventory rejects ${mutation}`, () => {
    const file = join(output, 'pfge-pf-v1-test-vectors.json');
    const original = readFileSync(file, 'utf8');
    try {
      const value = JSON.parse(original);
      if (mutation === 'missing') value.encodingVectors.shift();
      if (mutation === 'duplicate') value.encodingVectors[1] = value.encodingVectors[0];
      if (mutation === 'missingId') delete value.encodingVectors[0].id;
      if (mutation === 'unknown') value.unregisteredVectors = [];
      if (mutation === 'S-01') value.engineInternalSeedAtRestVectors = [{ id: 'S-01' }];
      if (mutation === 'tampered') value.encodingVectors[0].hex = 'ff';
      let mutated = original;
      if (mutation === 'unknown') mutated = original.replace('{', '{"unregisteredVectors":[],');
      else if (mutation === 'S-01') mutated = original.replace('{', '{"engineInternalSeedAtRestVectors":[{"id":"S-01"}],');
      else {
        // Replace only this integer-token-only group, preserving hostile float tokens elsewhere.
        const start = original.indexOf('"encodingVectors":');
        const end = original.indexOf('"minesShuffleSyntheticVectors":', start);
        mutated = original.slice(0, start) + '"encodingVectors":' + JSON.stringify(value.encodingVectors) + ',\n  ' + original.slice(end);
      }
      writeFileSync(file, mutated);
      assert.throws(() => loadPublicVectors(output));
    } finally { writeFileSync(file, original); }
  });
}
const documents = loadPublicVectors(output);
for (const [filename, groups] of [['pfge-pf-v1-test-vectors.json', pfCounts], ['pfge-gm-v1-test-vectors.json', gmCounts]] as const) {
  for (const group of Object.keys(groups)) {
    for (const entry of documents[filename]![group] as Record<string, unknown>[]) {
      const id = entry.id ?? `${entry.mathProfileId}/${entry.mathProfileVersion}`;
      test(`inventory ${filename}/${group}/${id}`, () => assert.ok(typeof id === 'string' && id.length > 0));
    }
  }
}
for (const [index, check] of (documents['pfge-gm-v1-test-vectors.json']!.acceptanceChecks as string[]).entries()) {
  test(`inventory PFGE-GM/acceptanceChecks/${index + 1}`, () => assert.ok(check.length > 0));
}

