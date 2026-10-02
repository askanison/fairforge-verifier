import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createVerifier,parseVerificationJson } from '../dist/index.js';
import { pf } from './vectors.ts';
import { digests } from './web-crypto.ts';
test('explicit provider executes SHA then purpose-bound HMAC',async()=>{
 const calls:string[]=[];const provider={async sha256(m:Uint8Array){calls.push('sha');return digests.sha256(m);},async hmacSha256(k:Uint8Array,m:Uint8Array){calls.push('hmac');assert.equal(k.length,32);return digests.hmacSha256(k,m);}};
 assert.deepEqual(await createVerifier(provider).verifyFull(pf.payloadVectors[0].payload,pf.payloadVectors[0].deviceRecord),pf.payloadVectors[0].expected);assert.deepEqual(calls,['sha','hmac']);
 assert.equal(typeof parseVerificationJson,'function');
});
for(const method of ['sha256','hmacSha256'] as const)for(const length of [0,31,33])test(`${method} rejects ${length} bytes as execution error`,async()=>{
 await assert.rejects(createVerifier({...digests,[method]:async()=>new Uint8Array(length)}).verifyFull(pf.payloadVectors[0].payload),/32 bytes/);
});
for(const method of ['sha256','hmacSha256'] as const)test(`${method} provider failure propagates`,async()=>{
 const error=new Error('Provider unavailable');await assert.rejects(createVerifier({...digests,[method]:async()=>{throw error;}}).verifyFull(pf.payloadVectors[0].payload),e=>e===error);
});
test('early statuses make no crypto calls',async()=>{
 const fail=async()=>{throw new Error('Unexpected digest');};const verifier=createVerifier({sha256:fail,hmacSha256:fail});
 assert.deepEqual(await verifier.verifyFull({recovery:null}),{result:'RECOVERED_NOT_VERIFIABLE'});
 const payload=structuredClone(pf.payloadVectors[0].payload);payload.fairness.serverSeed=null;payload.math={};assert.deepEqual(await verifier.verifyFull(payload),{result:'NOT_REVEALED'});
});
test('verification snapshots caller payload and record before awaited crypto',async()=>{
 const v=structuredClone(pf.payloadVectors[0]);let release!:()=>void;
 const wait=new Promise<void>(resolve=>{release=resolve;});
 const provider={...digests,async sha256(message:Uint8Array){await wait;return digests.sha256(message);}};
 const pending=createVerifier(provider).verifyFull(v.payload,v.deviceRecord);
 v.payload.fairness.commitment='0'.repeat(64);v.payload.fairness.clientSeed='different';v.payload.wager.direction='over';v.payload.claimed.rollInt=0;v.payload.math.payout='1.0000';v.deviceRecord.commitmentId='00000000-0000-0000-0000-000000000000';
 release();assert.deepEqual(await pending,v.expected);
});
