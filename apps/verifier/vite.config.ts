import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, lstatSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { resolve, relative, sep, dirname } from 'node:path';

const root = fileURLToPath(new URL('../../', import.meta.url));
let sourceCommit: string | null = null;
let dirty: boolean | null = null;
const { version: packageVersion } = JSON.parse(readFileSync(new URL('../../packages/verifier/package.json', import.meta.url), 'utf8')) as { version: string };
const receiptPath = resolve(root, 'source-receipt.json');
if (existsSync(receiptPath)) {
  // Explicit build input only: never a payload/window/runtime override or authenticated provenance.
  if (lstatSync(receiptPath).isSymbolicLink()) throw new Error('Symlink verifier source receipt');
  const receipt = JSON.parse(readFileSync(receiptPath, 'utf8')) as { format: string; sourceCommit: string; dirty: boolean; packageVersion: string; contentSha256: string; files: Record<string, string> };
  const hash = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');
  if (receipt.format !== 'fairforge-public-source-v1' || !/^[a-f0-9]{40}$/.test(receipt.sourceCommit) || typeof receipt.dirty !== 'boolean' || receipt.packageVersion !== packageVersion || !receipt.files ||
      hash(JSON.stringify(receipt.files, null, 2) + '\n') !== receipt.contentSha256) throw new Error('Invalid verifier source receipt');
  for (const [name, digest] of Object.entries(receipt.files)) {
    const file = resolve(root, name);
    const rel = relative(root, file);
    if (name.startsWith('/') || rel === '..' || rel.startsWith(`..${sep}`) || !/^[a-f0-9]{64}$/.test(digest)) throw new Error('Invalid verifier receipt path/digest');
    let part = file;
    while (part !== root.replace(/[/\\]$/, '')) {
      if (lstatSync(part).isSymbolicLink()) throw new Error('Symlink verifier receipt input');
      part = dirname(part);
    }
    if (hash(readFileSync(file)) !== digest) throw new Error(`Changed verifier receipt input: ${name}`);
  }
  sourceCommit = receipt.sourceCommit;
  dirty = receipt.dirty;
} else {
  try {
    sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    dirty = execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim().length > 0;
  } catch { /* Standalone exports without a source receipt have unavailable provenance. */ }
}
const buildMetadata = { sourceCommit, dirty, packageVersion };

export default defineConfig({
  base: './',
  plugins: [react(), {
    name: 'verifier-build-metadata',
    generateBundle() {
      // Build-generated comparison metadata, not an authenticated source receipt.
      this.emitFile({ type: 'asset', fileName: 'build-identity.json', source: JSON.stringify(buildMetadata) });
      for (const name of ['LICENSE', 'UNICODE-LICENSE.txt']) {
        this.emitFile({ type: 'asset', fileName: name, source: readFileSync(new URL(`../../packages/verifier/${name}`, import.meta.url), 'utf8') });
      }
    },
  }],
  define: { __VERIFIER_BUILD__: JSON.stringify(buildMetadata) },
});
