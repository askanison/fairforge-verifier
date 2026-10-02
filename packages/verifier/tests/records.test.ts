import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createVerifier,parseVerificationJson,payoutMath,parseAmount } from '../dist/index.js';
import { pf } from './vectors.ts';
import { digests } from './web-crypto.ts';
const verifier=createVerifier(digests);
const success={result:'VERIFIED',evidence:'none',recordStatus:'unreadable',witnessedSeqs:[],unwitnessedSeqs:[1,2,3]};
function pair(){return structuredClone(pf.payloadVectors.find(v=>v.id==='P-18')!);}
for(const seq of ['9007199254740992','9007199254740993','1e10000000000000000000000000000'])test(`raw huge integral seq ${seq} is readable contradiction`,async()=>{
 const v=pair();const raw=JSON.stringify(v.deviceRecord).replace('"seq":1',`"seq":${seq}`);
 assert.deepEqual(await verifier.verifyFull(v.payload,parseVerificationJson(raw)),{result:'CLIENT_RECORD_MISMATCH'});
});
for(const seq of ['1.0','1e0','10e-1','1000000e-6'])test(`equivalent seq spelling ${seq} detects duplicate`,async()=>{
 const v=pair();const raw=JSON.stringify(v.deviceRecord).replace('"seq":2',`"seq":${seq}`);
 assert.deepEqual(await verifier.verifyFull(v.payload,parseVerificationJson(raw)),success);
});
test('huge distinct integral seq remains distinct; equivalent enormous spellings are duplicates',async()=>{
 const v=pair(),raw=JSON.stringify(v.deviceRecord).replace('"seq":1','"seq":9007199254740992').replace('"seq":2','"seq":9007199254740993');
 assert.deepEqual(await verifier.verifyFull(v.payload,parseVerificationJson(raw)),{result:'CLIENT_RECORD_MISMATCH'});
 assert.deepEqual(await verifier.verifyFull(v.payload,parseVerificationJson(raw.replace('9007199254740993','90071992547409920e-1'))),success);
});
for(const seq of ['1.000000000000000000000000000001','9007199254740992.1','1e-10000000000000000000000000000'])test(`raw nonintegral seq ${seq} discards whole record`,async()=>{
 const v=pair();assert.deepEqual(await verifier.verifyFull(v.payload,parseVerificationJson(JSON.stringify(v.deviceRecord).replace('"seq":1',`"seq":${seq}`))),success);
});
test('decoded numbers use actual supplied values while raw near-integer tokens remain nonintegral',async()=>{
 const v=pair();const raw=JSON.stringify(v.deviceRecord).replace('"seq":1','"seq":1.000000000000000000000000000001');
 assert.deepEqual(await verifier.verifyFull(v.payload,JSON.parse(raw)),v.expected);
 assert.deepEqual(await verifier.verifyFull(v.payload,parseVerificationJson(raw)),success);
});
test('cashout null tile counts as absent metadata',async()=>{
 const v=pair();v.deviceRecord.actions[2].tile=null;assert.deepEqual(await verifier.verifyFull(v.payload,v.deviceRecord),v.expected);
});
for(const p of [0,18])test(`129-digit canonical winning amount p=${p} verifies without cap`,async()=>{
 const v=structuredClone(pf.payloadVectors[0]);const stake='1'+'0'.repeat(128)+(p?'.'+'0'.repeat(p):'');
 v.payload.wager.stake=stake;v.payload.wager.direction='over';v.payload.wager.targetInt=4999;
 // Independently prescribed 1.9800× economics, with no authoritative Number arithmetic.
 const units=BigInt('1'+'0'.repeat(128+p));
 const digits=(units*19800n).toString().padStart(p+5,'0');const pre=digits.slice(0,-p-4)+'.'+digits.slice(-p-4);
 const paid=(units*19800n/10000n).toString().padStart(p+1,'0');
 v.payload.math={result:'win',payableMultiplier:'1.9800',preRoundingPayout:pre,payout:p?paid.slice(0,-p)+'.'+paid.slice(-p):paid};
 v.deviceRecord.submission.wager=structuredClone(v.payload.wager);
 assert.deepEqual(await verifier.verifyFull(v.payload,v.deviceRecord),v.expected);
 assert.equal(parseAmount(stake).precision,p);
});
test('long canonical contradictory record remains readable',async()=>{
 const v=structuredClone(pf.payloadVectors[0]);v.deviceRecord.submission.wager.stake='1'+'0'.repeat(128)+'.0000';assert.deepEqual(await verifier.verifyFull(v.payload,v.deviceRecord),{result:'CLIENT_RECORD_MISMATCH'});
});
test('long canonical amount with absent and null seeds preserves reveal precedence',async()=>{
 for(const nullSeed of [false,true]){const v=structuredClone(pf.payloadVectors[0]);v.payload.wager.stake='1'+'0'.repeat(128)+'.'+'0'.repeat(18);v.payload.math={};if(nullSeed)v.payload.fairness.serverSeed=null;else delete v.payload.fairness.serverSeed;assert.deepEqual(await verifier.verifyFull(v.payload),{result:'NOT_REVEALED'});}
});
test('raw duplicate names consistently use last member and strings remain literal',async()=>{
 const v=structuredClone(pf.payloadVectors[0]);const raw=JSON.stringify(v.payload).replace('"targetInt":5000','"targetInt":true,"targetInt":5000.0');
 assert.deepEqual(await verifier.verifyFull(parseVerificationJson(raw),v.deviceRecord),v.expected);
 assert.deepEqual(await verifier.verifyFull(parseVerificationJson(raw.replace('true,"targetInt":5000.0','5000,"targetInt":true'))),{result:'FORMAT_ERROR'});
 const record=JSON.stringify(v.deviceRecord).replace('"submittedAt":','"\\ud800":0,"submittedAt":');
 assert.deepEqual(await verifier.verifyFull(v.payload,parseVerificationJson(record)),v.expected);
 assert.equal((parseVerificationJson('{"x":"\\ud800","x":"\\u0061\\n"}') as {x:string}).x,'a\n');
 assert.deepEqual(Object.keys(parseVerificationJson('{"__proto__":null}') as object),['__proto__']);
});
for(const raw of ['','01','[1,]','{"x":1,}','true false','"\\q"','"\n"','1e','+1'])test(`invalid JSON throws ${JSON.stringify(raw)}`,()=>assert.throws(()=>parseVerificationJson(raw),SyntaxError));
test('required reveal tile null discards the whole record',async()=>{
 const v=pair();v.deviceRecord.actions[0].tile=null;assert.deepEqual(await verifier.verifyFull(v.payload,v.deviceRecord),success);
});
for(const field of ['payableMultiplier','preRoundingPayout','payout'])test(`long canonical wrong ${field} reaches payout check after commitment`,async()=>{
 const v=structuredClone(pf.payloadVectors[0]);const digits=field==='payableMultiplier'?4:field==='preRoundingPayout'?8:4;
 v.payload.math[field]='1'+'0'.repeat(128)+'.'+'0'.repeat(digits);
 assert.deepEqual(await verifier.verifyFull(v.payload),{result:'PAYOUT_MISMATCH'});
 v.payload.fairness.commitment='0'.repeat(64);assert.deepEqual(await verifier.verifyFull(v.payload),{result:'COMMITMENT_MISMATCH'});
});
for(const stake of ['01.0000','1.','1.0000\n','+1.0000','1e2','١.0000','1.'+'0'.repeat(19)])test(`noncanonical stake ${JSON.stringify(stake)}`,async()=>{
 const v=structuredClone(pf.payloadVectors[0]);v.payload.wager.stake=stake;assert.deepEqual(await verifier.verifyFull(v.payload),{result:'FORMAT_ERROR'});
});
test('raw payload controls preserve nonintegral tails and huge exponents; decoded values use actual numbers',async()=>{
 const v=structuredClone(pf.payloadVectors[0]);const raw=JSON.stringify(v.payload).replace('"targetInt":5000','"targetInt":5000.0000000000000000000001');
 assert.deepEqual(await verifier.verifyFull(parseVerificationJson(raw)),{result:'FORMAT_ERROR'});
 assert.deepEqual(await verifier.verifyFull(JSON.parse(raw),v.deviceRecord),v.expected);
 const huge=JSON.stringify(v.payload).replace('"protocolVersion":1','"protocolVersion":1e1000000000000000000000000000000000');assert.deepEqual(await verifier.verifyFull(parseVerificationJson(huge)),{result:'FORMAT_ERROR'});
});
test('informative record strings retain literal surrogate escapes but client seed rejects them',async()=>{
 const v=pair();v.deviceRecord.submission.submittedAt='\ud800';v.deviceRecord.actions[0].requestId='\ud800';assert.deepEqual(await verifier.verifyFull(v.payload,parseVerificationJson(JSON.stringify(v.deviceRecord))),v.expected);
 v.deviceRecord.submission.clientSeed='\ud800';assert.deepEqual(await verifier.verifyFull(v.payload,parseVerificationJson(JSON.stringify(v.deviceRecord))),success);
 v.payload.fairness.clientSeed='\ud800';assert.deepEqual(await verifier.verifyFull(parseVerificationJson(JSON.stringify(v.payload))),{result:'FORMAT_ERROR'});
});
for (const useRecord of [true, false]) test(`sparse reveal array rejects invented safe cashout ${useRecord ? 'with complete record' : 'without record'}`, async () => {
 const v = pair();
 v.payload.actions.reveals = new Array(1);
 v.payload.claimed.safeRevealed = 1;
 v.payload.math = { result: 'cashout', payableMultiplier: '1.1250', preRoundingPayout: '0.11250000', payout: '0.1125' };
 v.deviceRecord.actions = [{ seq: 2, kind: 'cashout', requestId: 'sparse-proof' }];
 assert.deepEqual(await verifier.verifyFull(v.payload, useRecord ? v.deviceRecord : undefined), { result: 'FORMAT_ERROR' });
 // An explicit JSON null remains a replay failure, not a sparse-array format rejection.
 v.payload.actions.reveals = [null];
 assert.deepEqual(await verifier.verifyFull(v.payload, useRecord ? v.deviceRecord : undefined), { result: 'INVALID_TILE' });
});
test('sparse device action array discards the whole record independently', async () => {
 const v = pair();
 const actions = new Array(2);
 actions[1] = { seq: 3, kind: 'cashout', requestId: 'sparse-record' };
 v.deviceRecord.actions = actions;
 assert.deepEqual(await verifier.verifyFull(v.payload, v.deviceRecord), success);
});
test('prototype-filled reveal hole is not an own JSON element', async () => {
 const v = pair();
 const reveals = new Array(1);
 const prototype = Object.create(Array.prototype) as Record<string, unknown>;
 prototype[0] = 0;
 Object.setPrototypeOf(reveals, prototype);
 v.payload.actions.reveals = reveals;
 v.payload.claimed.safeRevealed = 1;
 v.payload.math = { result: 'cashout', payableMultiplier: '1.1250', preRoundingPayout: '0.11250000', payout: '0.1125' };
 assert.deepEqual(await verifier.verifyFull(v.payload), { result: 'FORMAT_ERROR' });
});

for (const stake of [null,1,true,{},'', '00.1000','0.0000']) test(`final contract unreadable record stake ${JSON.stringify(stake)}`,async()=>{
 const v=pair();v.deviceRecord.submission.wager.stake=stake;
 assert.deepEqual(await verifier.verifyFull(v.payload,v.deviceRecord),success);
});
test('final contract malformed record does not preempt sorted wrong-cardinality outcome',async()=>{
 const v=pair();v.payload.claimed.mines=[15,17];v.deviceRecord.actions[0].tile=null;
 assert.deepEqual(await verifier.verifyFull(v.payload,v.deviceRecord),{result:'OUTCOME_MISMATCH'});
});
