import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateClientSeed } from '../dist/fairness/client-seed.js';
import { pf } from './vectors.ts';
for(const v of pf.clientSeedValidationVectors)test(v.id,()=>{
 const seed=v.value;
 assert.equal(validateClientSeed(seed),v.expected.reason);
});
