import { readdir, readFile, realpath } from 'node:fs/promises';
import { resolve, relative, sep, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const ioNames = new Set(['fetch', 'window', 'document', 'localStorage', 'sessionStorage', 'indexedDB', 'navigator', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'Worker', 'SharedWorker', 'process', 'require', 'Deno', 'Bun', 'eval', 'Function', 'globalThis', 'self']);
// Deliberately enumerated reviewed artifacts. Adding a module requires boundary review.
export const packedFiles = Object.freeze([
  "package.json",
  "LICENSE",
  "UNICODE-LICENSE.txt",
  "README.md",
  "tsconfig.json",
  "dist/LICENSE",
  "dist/UNICODE-LICENSE.txt",
  "src/index.ts",
  "src/crypto.ts",
  "src/encoding/json.ts",
  "src/encoding/primitives.ts",
  "src/fairness/client-seed.ts",
  "src/fairness/stream.ts",
  "src/fairness/unicode/ucd16-data.generated.ts",
  "src/math/amount.ts",
  "src/math/rational.ts",
  "src/math/payout.ts",
  "src/math/auto-bet.ts",
  "src/math/availability.ts",
  "src/math/profiles.ts",
  "src/verification/verifier.ts",
  "src/verification/records.ts",
  "src/verification/validation.ts",
  "src/verification/replay.ts",
  "dist/index.js",
  "dist/index.d.ts",
  "dist/crypto.js",
  "dist/crypto.d.ts",
  "dist/encoding/json.js",
  "dist/encoding/json.d.ts",
  "dist/encoding/primitives.js",
  "dist/encoding/primitives.d.ts",
  "dist/fairness/client-seed.js",
  "dist/fairness/client-seed.d.ts",
  "dist/fairness/stream.js",
  "dist/fairness/stream.d.ts",
  "dist/fairness/unicode/ucd16-data.generated.js",
  "dist/fairness/unicode/ucd16-data.generated.d.ts",
  "dist/math/amount.js",
  "dist/math/amount.d.ts",
  "dist/math/rational.js",
  "dist/math/rational.d.ts",
  "dist/math/payout.js",
  "dist/math/payout.d.ts",
  "dist/math/auto-bet.js",
  "dist/math/auto-bet.d.ts",
  "dist/math/availability.js",
  "dist/math/availability.d.ts",
  "dist/math/profiles.js",
  "dist/math/profiles.d.ts",
  "dist/verification/verifier.js",
  "dist/verification/verifier.d.ts",
  "dist/verification/records.js",
  "dist/verification/records.d.ts",
  "dist/verification/validation.js",
  "dist/verification/validation.d.ts",
  "dist/verification/replay.js",
  "dist/verification/replay.d.ts"
]);
const packedAllowlist = new Set(packedFiles);

export function checkPackedFiles(files) {
  const paths = files.map(file => file.path);
  return [
    ...paths.filter(path => !packedAllowlist.has(path)).map(path => `Forbidden package artifact: ${path}`),
    ...packedFiles.filter(path => !paths.includes(path)).map(path => `Missing package artifact: ${path}`),
    ...paths.filter((path, index) => paths.indexOf(path) !== index).map(path => `Duplicate package artifact: ${path}`),
  ];
}

export async function checkVerifierSource(sourceDirectory) {
  const root = await realpath(sourceDirectory);
  const errors = [];
  async function scan(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = resolve(dir, entry.name);
      if (entry.isSymbolicLink()) { errors.push(`Verifier source cannot be a symlink: ${path}`); continue; }
      if (entry.isDirectory()) { await scan(path); continue; }
      if (!/\.tsx?$/.test(entry.name)) { errors.push(`Unexpected verifier source file: ${path}`); continue; }
      const ast = ts.createSourceFile(path, await readFile(path, 'utf8'), ts.ScriptTarget.Latest, true);
      if (ast.parseDiagnostics.length) errors.push(`Invalid TypeScript source: ${path}`);
      if (entry.name.endsWith('.tsx')) errors.push(`React/JSX source is forbidden: ${path}`);
      if (ast.typeReferenceDirectives.length || ast.referencedFiles.length || ast.libReferenceDirectives.length) errors.push(`Triple-slash references are forbidden: ${path}`);
      function checkImport(specifier) {
        if (!specifier || !ts.isStringLiteralLike(specifier)) { errors.push(`Dynamic import must use a local literal: ${path}`); return; }
        const target = specifier.text;
        const location = resolve(dirname(path), target);
        const rel = relative(root, location);
        if (!target.startsWith('.') || rel === '..' || rel.startsWith(`..${sep}`) || target.includes('node_modules')) errors.push(`Forbidden verifier import ${target}: ${path}`);
      }
      function visit(node) {
        if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) { if (node.moduleSpecifier) checkImport(node.moduleSpecifier); }
        if (ts.isImportTypeNode(node)) { checkImport(ts.isLiteralTypeNode(node.argument) ? node.argument.literal : undefined); }
        if (ts.isImportEqualsDeclaration(node)) errors.push(`Import aliases are forbidden: ${path}`);
        if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) checkImport(node.arguments[0]);
        if (ts.isIdentifier(node) && ioNames.has(node.text)) errors.push(`Forbidden IO/global identifier ${node.text}: ${path}`);
        if (ts.isMetaProperty(node)) errors.push(`Runtime metadata access is forbidden: ${path}`);
        if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node) || ts.isJsxFragment(node)) errors.push(`JSX is forbidden: ${path}`);
        ts.forEachChild(node, visit);
      }
      visit(ast);
    }
  }
  await scan(root);
  return errors;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(fileURLToPath(new URL('../', import.meta.url)));
  const errors = await checkVerifierSource(resolve(root, 'packages/verifier/src'));
  const pkg = JSON.parse(await readFile(resolve(root, 'packages/verifier/package.json'), 'utf8'));
  if (Object.keys(pkg.dependencies ?? {}).length || Object.keys(pkg.peerDependencies ?? {}).length || Object.keys(pkg.optionalDependencies ?? {}).length) errors.push('Verifier runtime dependencies are forbidden at the foundation boundary');
  if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
  else console.log('Verifier source boundary passed: local pure TypeScript only; no runtime dependencies.');
}
