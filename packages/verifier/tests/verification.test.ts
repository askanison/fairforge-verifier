import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createVerifier,approvedMathProfiles } from '../dist/index.js';
import { verifyFairnessForTests } from '../dist/verification/verifier.js';
import { digests } from './web-crypto.ts';
import { pf,gm,exactPf,exactGm,type Fixture } from './vectors.ts';
import { fixtureRegistry } from './fixtures.ts';
for(const [group,fixtures,raw] of [['P',pf.payloadVectors,exactPf().payloadVectors],['PM',gm.payloadVectors,exactGm().payloadVectors]] as const)for(const [index,v] of (fixtures as Fixture[]).entries()){
 const registry=v.registry==='approved+fixtures'?fixtureRegistry:approvedMathProfiles;
 test(`${group} full ${v.id}`,async()=>assert.deepEqual(await createVerifier(digests,registry).verifyFull(raw[index].payload,raw[index].deviceRecord),v.expected));
 test(`${group} intermediate ${v.id}`,async()=>{
  const expected=v.expected.result==='PAYOUT_MISMATCH'?{result:'VERIFIED',evidence:'none',recordStatus:'absent',witnessedSeqs:[],unwitnessedSeqs:raw[index].payload.round.gameId==='dice'?[]:Array.from({length:raw[index].payload.actions.reveals.length+(raw[index].payload.actions.end==='cashout'?1:0)},(_,i)=>i+1)}:v.expected;
  assert.deepEqual(await verifyFairnessForTests(digests,registry,raw[index].payload,raw[index].deviceRecord),expected);
 });
}
test('registry defaults are exactly six approved entries and payload fixture data cannot extend them',async()=>{
 assert.equal(approvedMathProfiles.length,6);const payload=structuredClone(pf.payloadVectors[0].payload);payload.wager.pinned.mathProfileId='fixture-dice';payload.registryFixtures=gm.registryFixtures;
 assert.deepEqual(await createVerifier(digests).verifyFull(payload),{result:'UNSUPPORTED_VERSION'});
});
test('recorded NFD seed verifies without admission normalization',async()=>{
 const payload=structuredClone(pf.payloadVectors[0].payload);Object.assign(payload.round,pf.diceVectors[1].input);delete payload.round.wager;payload.fairness={...payload.fairness,...pf.diceVectors[1].input,clientSeed:pf.negativeVectors[3].clientSeedNfd,commitment:pf.diceVectors[1].expected.commitment};payload.claimed.rollInt=5926;
 assert.deepEqual(await createVerifier(digests).verifyFull(payload),{result:'VERIFIED',evidence:'none',recordStatus:'absent',witnessedSeqs:[],unwitnessedSeqs:[]});
});
for(const input of [null,true,1,'x',[],{}, {round:null}])test(`hostile root ${JSON.stringify(input)}`,async()=>assert.deepEqual(await createVerifier(digests).verifyFull(input),{result:'FORMAT_ERROR'}));
test('unknown fairness/round metadata cannot replace canonical hashed context',async()=>{
 const v=structuredClone(pf.payloadVectors[0]);Object.assign(v.payload.fairness,{commitmentId:'00000000-0000-0000-0000-000000000000',roundId:'00000000-0000-0000-0000-000000000000',gameId:'mines',gameVersion:'1.0.1',casinoId:'00000000-0000-0000-0000-000000000000'});Object.assign(v.payload.round,{clientSeed:'tampered',serverSeed:'ff'.repeat(32),clientRandomness:'00'.repeat(32)});
 assert.deepEqual(await createVerifier(digests).verifyFull(v.payload,v.deviceRecord),v.expected);
});
import { Rational } from '../dist/index.js';
test('approved registry and every nested profile/rational/versions object are frozen',()=>{
 assert.ok(Object.isFrozen(approvedMathProfiles));for(const profile of approvedMathProfiles){assert.ok(Object.isFrozen(profile));assert.ok(Object.isFrozen(profile.gameVersions));assert.ok(Object.isFrozen(profile.nominalRtp));}
});
test('explicit trusted registry is snapshotted at verifier creation',async()=>{
 const profile={...approvedMathProfiles[0],gameVersions:['1.0.0'],nominalRtp:new Rational(99n,100n)};const registry=[profile];const verifier=createVerifier(digests,registry);
 registry.length=0;Object.assign(profile.nominalRtp,{n:97n});profile.gameVersions.length=0;
 assert.deepEqual(await verifier.verifyFull(pf.payloadVectors[0].payload,pf.payloadVectors[0].deviceRecord),pf.payloadVectors[0].expected);
});

// Derived ordered-contract cases; frozen inputs and expected objects remain untouched.
import { parseVerificationJson, type VerificationResult } from '../dist/index.js';
type FinalContext = 'valid' | 'bad commitment' | 'contradictory record' | 'unknown profile' | 'unrevealed' | 'recovery' | 'wrong payout' | 'unknown profile + bad commitment';
function finalCase(id: string, fixtureId: string, change: (payload: Fixture['payload']) => void, context: FinalContext, expected: VerificationResult, useRecord = true) {
 const v = structuredClone(pf.payloadVectors.find(v => v.id === fixtureId)!);
 change(v.payload);
 if ((context === 'bad commitment' || context === 'unknown profile + bad commitment')) v.payload.fairness.commitment = '00'.repeat(32);
 if (context === 'contradictory record') v.deviceRecord.submission.clientSeed = 'contradictory-seed';
 if ((context === 'unknown profile' || context === 'unknown profile + bad commitment')) v.payload.wager.pinned.mathProfileId = 'unknown-valid-profile';
 if (context === 'unrevealed') { delete v.payload.fairness.serverSeed; v.payload.math = {}; }
 if (context === 'recovery') v.payload.recovery = null;
 if (context === 'wrong payout') v.payload.math.payout = '0.0000';
 const payloadJson = JSON.stringify(v.payload), recordJson = useRecord ? JSON.stringify(v.deviceRecord) : undefined;
 test(`final contract ${id} / ${context}`, async () => {
  if (process.env.FAIRFORGE_FINAL_CASES === '1') console.log(JSON.stringify({id:`${id} / ${context}`,payloadJson,recordJson,expected}));
  assert.deepEqual(await createVerifier(digests).verifyFull(parseVerificationJson(payloadJson),recordJson === undefined ? undefined : parseVerificationJson(recordJson)),expected);
 });
}
for (const [label, stake] of [['null',null],['number',1],['boolean',true],['object',{}]] as const) {
 for (const context of ['valid','bad commitment','unknown profile','unknown profile + bad commitment','unrevealed','recovery'] as const)
  finalCase(`primitive stake ${label}`,'P-01',p => {p.wager.stake=stake;},context,{result:context==='recovery'?'RECOVERED_NOT_VERIFIABLE':'FORMAT_ERROR'});
}
for (const [label,stake] of [['empty',''],['leading zero','00.1000'],['negative','-0.1000'],['zero','0.0000']] as const) {
 for (const context of ['valid','bad commitment','unknown profile','recovery'] as const)
  finalCase(`string stake ${label}`,'P-01',p=>{p.wager.stake=stake;},context,{result:context==='recovery'?'RECOVERED_NOT_VERIFIABLE':context==='unknown profile'?'UNSUPPORTED_VERSION':'FORMAT_ERROR'});
}
for (const [label,mines,shape] of [
 ['sorted short',[15,17],false],['sorted long',[1,15,17,22],false],['sorted duplicate',[15,15,17],false],
 ['descending',[17,15,22],true],['nonintegral',[15,17.5,22],true],['out of range',[15,17,25],true],
] as const) {
 for (const context of ['valid','bad commitment','contradictory record'] as const)
  finalCase(`claimed mines ${label}`,'P-18',p=>{p.claimed.mines=[...mines];},context,{result:shape?'FORMAT_ERROR':context==='bad commitment'?'COMMITMENT_MISMATCH':context==='contradictory record'?'CLIENT_RECORD_MISMATCH':'OUTCOME_MISMATCH'});
}
for (const [label,actions] of [['null',null],['object',{}]] as const) {
 for (const context of ['valid','bad commitment','unknown profile','unrevealed','recovery'] as const)
  finalCase(`Dice actions member ${label}`,'P-01',p=>{p.actions=actions;},context,{result:context==='recovery'?'RECOVERED_NOT_VERIFIABLE':'FORMAT_ERROR'});
}
for (const context of ['valid','bad commitment','unknown profile','unrevealed','recovery'] as const) {
 const expected: VerificationResult = context==='valid'?{result:'VERIFIED',evidence:'complete',recordStatus:'used',witnessedSeqs:[],unwitnessedSeqs:[]}:{result:context==='bad commitment'?'COMMITMENT_MISMATCH':context==='unknown profile'?'UNSUPPORTED_VERSION':context==='unrevealed'?'NOT_REVEALED':'RECOVERED_NOT_VERIFIABLE'};
 finalCase('Dice actions actual absence','P-01',()=>{},context,expected);
}
for (const context of ['valid','bad commitment','contradictory record','wrong payout'] as const)
 finalCase('generic safe count 23','P-18',p=>{p.claimed.safeRevealed=23;},context,{result:context==='bad commitment'?'COMMITMENT_MISMATCH':context==='contradictory record'?'CLIENT_RECORD_MISMATCH':'OUTCOME_MISMATCH'});
for (const value of [23.5,true] as const)
 finalCase(`invalid safe count ${value}`,'P-18',p=>{p.claimed.safeRevealed=value;},'bad commitment',{result:'FORMAT_ERROR'});
for (const [label,reveals] of [['negative',[-1]],['out of range',[25]],['nonintegral',[0.5]],['null',[null]],['boolean',[true]],['duplicate',[0,0]]] as const)
 for (const context of ['valid','bad commitment'] as const)
  finalCase(`invalid reveal ${label}`,'P-18',p=>{p.actions.reveals=[...reveals];},context,{result:context==='bad commitment'?'COMMITMENT_MISMATCH':'INVALID_TILE'},false);
for (const token of ['23.0','23e0','230e-1']) test(`final contract exact generic safe count ${token}`,async()=>{
 const v=structuredClone(pf.payloadVectors.find(v=>v.id==='P-18')!);
 const payloadJson=JSON.stringify(v.payload).replace('"safeRevealed":2',`"safeRevealed":${token}`);
 const expected:VerificationResult={result:'OUTCOME_MISMATCH'},recordJson=JSON.stringify(v.deviceRecord);
 if(process.env.FAIRFORGE_FINAL_CASES==='1')console.log(JSON.stringify({id:`exact generic safe count ${token}`,payloadJson,recordJson,expected}));
 assert.deepEqual(await createVerifier(digests).verifyFull(parseVerificationJson(payloadJson),parseVerificationJson(recordJson)),expected);
});
