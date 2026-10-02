import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, readdirSync, lstatSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { checkPackedFiles, checkVerifierSource } from './frontend-boundaries.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const source = join(root, 'packages/verifier');
const temporary = mkdtempSync(join(tmpdir(), 'fairforge-public-pack-'));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
try {
  const boundary = await checkVerifierSource(join(source, 'src'));
  if (boundary.length) throw new Error(boundary.join('\n'));
  const [pack] = JSON.parse(execFileSync('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', temporary], { cwd: source, encoding: 'utf8' }));
  const errors = checkPackedFiles(pack.files);
  if (errors.length) throw new Error(errors.join('\n'));
  for (const { path } of pack.files) {
    let candidate = join(source, path);
    while (candidate !== source) {
      if (lstatSync(candidate).isSymbolicLink()) throw new Error(`Symlink package artifact: ${path}`);
      candidate = resolve(candidate, '..');
    }
  }
  for (const name of ['LICENSE', 'UNICODE-LICENSE.txt']) {
    if (hash(readFileSync(join(source, name))) !== hash(readFileSync(join(source, 'dist', name)))) throw new Error(`Changed distribution notice: ${name}`);
  }
  const tarball = join(temporary, pack.filename);
  writeFileSync(join(temporary, 'package.json'), JSON.stringify({ name: 'fairforge-disposable-package-consumer', version: '0.0.0', private: true, type: 'module' }));
  execFileSync('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--prefix', temporary, tarball], { cwd: temporary, encoding: 'utf8' });
  const installed = join(temporary, 'node_modules/@fairforge/verifier');
  const installedPaths = [];
  function scan(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const file = join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error('Installed package symlink');
      if (entry.isDirectory()) scan(file);
      else installedPaths.push({ path: file.slice(installed.length + 1) });
    }
  }
  scan(installed);
  const installedErrors = checkPackedFiles(installedPaths);
  if (installedErrors.length) throw new Error(installedErrors.join('\n'));
  const files = {};
  for (const { path } of installedPaths.sort((a,b) => a.path.localeCompare(b.path))) {
    const installedHash = hash(readFileSync(join(installed, path)));
    if (installedHash !== hash(readFileSync(join(source, path)))) throw new Error(`Installed artifact differs: ${path}`);
    files[path] = installedHash;
  }
  execFileSync('node', ['--input-type=module', '-e', "import {createVerifier,parseVerificationJson} from '@fairforge/verifier'; if(typeof createVerifier !== 'function' || typeof parseVerificationJson !== 'function') throw new Error('Missing public API'); const v=createVerifier({sha256:async()=>new Uint8Array(32),hmacSha256:async()=>new Uint8Array(32)}); if((await v.verifyFull(null)).result!=='FORMAT_ERROR') throw new Error('Independent package failed');"], { cwd: temporary, encoding: 'utf8' });
  const report = { independentImport: true, files, tarballSha256: hash(readFileSync(tarball)) };
  const reportIndex = process.argv.indexOf('--report');
  if (reportIndex >= 0) {
    if (!process.argv[reportIndex + 1]) throw new Error('--report requires a file path');
    writeFileSync(process.argv[reportIndex + 1], JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  }
  console.log(`Public verifier pack: ${installedPaths.length} reviewed installed artifacts; independent import passed; SHA256 ${report.tarballSha256}. Nothing was published.`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally { rmSync(temporary, { recursive: true, force: true }); }
