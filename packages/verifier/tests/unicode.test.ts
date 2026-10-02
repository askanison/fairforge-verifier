import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { normalizeNfc,validateClientSeed } from '../dist/fairness/client-seed.js';
import { assignedRanges } from '../dist/fairness/unicode/ucd16-data.generated.js';
test('Unicode16 official19965 normalization rows and assigned-scalar identity outside Part1',()=>{
 let rows=0;const part1=new Set<number>();let section='';
 const sequence=(text:string)=>String.fromCodePoint(...text.trim().split(/\s+/).filter(Boolean).map(v=>parseInt(v,16)));
 for(const line of readFileSync(new URL('../../../tests/fixtures/unicode/16.0.0/NormalizationTest.txt',import.meta.url),'utf8').split('\n')) {
  if(line.startsWith('@'))section=line;
  const fields=line.split('#')[0].trim().split(';');if(fields.length<5)continue;
  const [c1,c2,c3,c4,c5]=fields.slice(0,5).map(sequence);rows++;
  assert.equal(normalizeNfc(c1),c2,`row ${rows}/c1`);assert.equal(normalizeNfc(c2),c2);assert.equal(normalizeNfc(c3),c2);assert.equal(normalizeNfc(c4),c4);assert.equal(normalizeNfc(c5),c4);
  if(section.startsWith('@Part1'))for(const cp of c1)part1.add(cp.codePointAt(0)!);
  for(const [seed,nfc] of [[c1,c2],[c2,c2],[c3,c2],[c4,c4],[c5,c4]]) {
   const reason=validateClientSeed(seed);
   assert.equal(reason==='NOT_NFC',nfc!==seed,`admission row ${rows}`);
  }
 }
 assert.equal(rows,19965);
 for(const [lo,hi] of assignedRanges)for(let cp=lo;cp<=hi;cp++){
  if(cp>=0xd800&&cp<=0xdfff||part1.has(cp))continue;
  const seed=String.fromCodePoint(cp);assert.equal(normalizeNfc(seed),seed,`identity U+${cp.toString(16)}`);
  assert.notEqual(validateClientSeed(seed),'NOT_NFC');
 }
});
