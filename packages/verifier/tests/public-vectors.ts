// Test-only I/O, never imported by the verifier core or public package.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, lstatSync, existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const pfGroups = ['encodingVectors', 'nextIntVectors', 'minesShuffleSyntheticVectors', 'clientSeedValidationVectors', 'diceVectors', 'minesVectors', 'negativeVectors', 'payloadVectors'];
const gmGroups = ['amountVectors', 'mathProfiles', 'diceMultiplierVectors', 'diceTableDigests', 'minesTables', 'payoutVectors', 'availabilityVectors', 'minesSummaryVectors', 'autoBetVectors', 'payloadVectors'];
const pfMetadata = ['protocol', 'protocolVersion', 'vectorSetVersion', 'conventions'];
const gmMetadata = ['gameMathVersion', 'vectorSetVersion', 'conventions', 'assets', 'acceptanceChecks', 'registryFixtures'];
const filenames = ['pfge-pf-v1-test-vectors.json', 'pfge-gm-v1-test-vectors.json'];
const manifestName = 'public-vector-manifest.json';

type Pin = { identityFields: string[]; entries: { key: string[]; sha256: string }[] };
type FilePins = { source: string; sourceVectorSetVersion: string; groups: Record<string, Pin>; metadata: Record<string, string> };

function requireInventory(condition: unknown, detail: string): asserts condition {
  if (!condition) throw new Error(`Invalid public vector inventory: ${detail}`);
}
const numberTokens = new WeakMap<object, Map<string, string>>();
function canonical(value: unknown, parent?: object, key?: string): string {
  if (typeof value === 'number' && parent && key !== undefined) return numberTokens.get(parent)?.get(key) ?? JSON.stringify(value);
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((entry, index) => canonical(entry, value, String(index))).join(',')}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key], value, key)}`).join(',')}}`;
}
function digest(value: unknown): string {
  return createHash('sha256').update(canonical(value), 'utf8').digest('hex');
}
function sameKeys(actual: string[], expected: string[]): boolean {
  return JSON.stringify(actual.sort()) === JSON.stringify([...expected].sort());
}

export function loadPublicVectors(directory: string): Record<string, Record<string, unknown>> {
  requireInventory(!lstatSync(directory).isSymbolicLink(), 'symlink directory');
  requireInventory(sameKeys(readdirSync(directory), [...filenames, manifestName]), 'unrelated or missing files');
  for (const name of [...filenames, manifestName]) requireInventory(lstatSync(join(directory, name)).isFile() && !lstatSync(join(directory, name)).isSymbolicLink(), 'symlink or non-file');
  const read = (name: string) => JSON.parse(readFileSync(join(directory, name), 'utf8'), function (this: object, key: string, value: unknown, context?: { source?: string }) {
    // Frozen Python canonical hashes preserve hostile float-form integer tokens (e.g. 5000.0).
    // Keep their lexical identity for hashing without changing the values passed to core tests.
    if (typeof value === 'number') {
      let tokens = numberTokens.get(this);
      if (!tokens) { tokens = new Map(); numberTokens.set(this, tokens); }
      requireInventory(typeof context?.source === 'string', 'runtime must preserve numeric source tokens');
      tokens.set(key, context.source);
    }
    return value;
  });
  const manifest = read(manifestName) as { format: string; vectorSetVersion: string; entryCount: number; files: Record<string, FilePins> };
  requireInventory(manifest.format === 'pfge-public-vector-projection-v1' && manifest.vectorSetVersion === '1.0.0', 'projection identity');
  requireInventory(sameKeys(Object.keys(manifest.files), filenames), 'file pins');
  let count = 0;
  const documents: Record<string, Record<string, unknown>> = {};
  for (const [index, name] of filenames.entries()) {
    const groups = index === 0 ? pfGroups : gmGroups;
    const metadata = index === 0 ? pfMetadata : gmMetadata;
    const doc = read(name) as Record<string, unknown>;
    const pins = manifest.files[name]!;
    requireInventory(sameKeys(Object.keys(doc), [...groups, ...metadata]), 'unknown or missing group/metadata');
    requireInventory(sameKeys(Object.keys(pins.groups), groups) && sameKeys(Object.keys(pins.metadata), metadata), 'unknown or missing pins');
    requireInventory(pins.source === `${index === 0 ? 'Fairness Protocol' : 'Game Math'}/${name}` && pins.sourceVectorSetVersion === '1.0.0' && doc.vectorSetVersion === '1.0.0', 'source identity');
    requireInventory(index === 0 ? doc.protocol === 'PFGE-PF' && doc.protocolVersion === 1 : doc.gameMathVersion === 1, 'protocol/math identity');
    for (const key of metadata) requireInventory(digest(doc[key]) === pins.metadata[key], `metadata ${key}`);
    for (const group of groups) {
      const entries = doc[group];
      const pin = pins.groups[group]!;
      const fields = group === 'mathProfiles' ? ['mathProfileId', 'mathProfileVersion'] : ['id'];
      requireInventory(JSON.stringify(pin.identityFields) === JSON.stringify(fields), `identity fields ${group}`);
      requireInventory(Array.isArray(entries) && entries.length > 0 && entries.length === pin.entries.length, `missing/empty entries ${group}`);
      const seen = new Set<string>();
      for (const [position, entry] of entries.entries()) {
        requireInventory(entry && typeof entry === 'object' && !Array.isArray(entry), `entry object ${group}`);
        const key = fields.map(field => (entry as Record<string, unknown>)[field]);
        requireInventory(key.every(part => typeof part === 'string' && part.length > 0) && !key.includes('S-01'), `identity ${group}`);
        const identity = JSON.stringify(key);
        requireInventory(!seen.has(identity), `duplicate identity ${group}`);
        seen.add(identity);
        requireInventory(identity === JSON.stringify(pin.entries[position]!.key) && digest(entry) === pin.entries[position]!.sha256, `changed entry ${group}`);
        count++;
      }
    }
    documents[name] = doc;
  }
  requireInventory(count === manifest.entryCount && count >= 289, 'executed entry count');
  return documents;
}

// Keep the same projection validation and private exporter diagnostics in both trees.
export function preparePublicVectors(output: string): void {
  const root = fileURLToPath(new URL('../../../', import.meta.url));
  if (existsSync(join(root, 'source-receipt.json'))) {
    const projected = join(root, 'vectors');
    loadPublicVectors(projected); // Missing/tampered public input fails before copying.
    mkdirSync(output);
    for (const name of [...filenames, manifestName]) copyFileSync(join(projected, name), join(output, name));
  } else {
    execFileSync('python3', ['-B', join(root, 'scripts/export-public-vectors.py'), '--output', output]);
  }
  loadPublicVectors(output);
}
