import { mkdtempSync,realpathSync,readFileSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseVerificationJson } from '../dist/index.js';
import { loadPublicVectors, preparePublicVectors } from './public-vectors.ts';
const directory=realpathSync(mkdtempSync(join(tmpdir(),'fairforge-core-vectors-')));
let rawPf:string,rawGm:string;
try {
  const output=join(directory,'public');
  preparePublicVectors(output);
  loadPublicVectors(output);
  rawPf=readFileSync(join(output,'pfge-pf-v1-test-vectors.json'),'utf8');
  rawGm=readFileSync(join(output,'pfge-gm-v1-test-vectors.json'),'utf8');
} finally { rmSync(directory,{recursive:true,force:true}); }
// Fixture typings are test-only. Core entry points retain unknown validation.
export type Fixture = Record<string, any>;
export const pf=JSON.parse(rawPf) as Record<string,Fixture[]>;
export const gm=JSON.parse(rawGm) as Record<string,any>;
export const exactPf=()=>parseVerificationJson(rawPf) as Record<string,Fixture[]>;
export const exactGm=()=>parseVerificationJson(rawGm) as Record<string,Fixture[]>;
