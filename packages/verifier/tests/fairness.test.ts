import assert from 'node:assert/strict';
import { test } from 'node:test';
import { encode,hex } from '../dist/encoding/primitives.js';
import { commitment,commitmentPreimage,streamMessage,RandomStream,nextInt,shuffle } from '../dist/fairness/stream.js';
import { replayMines } from '../dist/verification/replay.js';
import { pf } from './vectors.ts';
import { digests } from './web-crypto.ts';
for(const v of pf.encodingVectors)test(v.id,()=>{
 const type=v.type==='hex32'?'hex32':v.type;
 if(v.error)assert.throws(()=>encode(type,v.value),{message:v.error});
 else assert.equal(hex(encode(type,v.value)),v.hex);
});
function candidates(values:number[]){let consumed=0;return {get consumed(){return consumed;},async nextU32(){assert.ok(consumed<values.length,'candidate exhaustion');return values[consumed++];}};}
for(const v of pf.nextIntVectors)test(v.id,async()=>{
 const reader=candidates(v.candidates);assert.equal(await nextInt(reader,v.n),v.expected.result);assert.equal(reader.consumed,v.expected.consumed);
 const limit=Math.floor(2**32/v.n)*v.n;assert.equal(limit,v.limit);assert.deepEqual(v.candidates.slice(0,reader.consumed).filter((c:number)=>c>=limit),v.expected.rejected);
});
for(const v of pf.minesShuffleSyntheticVectors)test(v.id,async()=>{
 const reader=candidates(v.candidates);const tiles=await shuffle(reader);assert.deepEqual(tiles,v.expected.permutation);assert.equal(reader.consumed,v.expected.consumed);assert.deepEqual(tiles.slice(0,3).sort((a,b)=>a-b),v.expected.minesFor3);
});
for(const v of [...pf.diceVectors,...pf.minesVectors])test(v.id,async()=>{
 const context={...v.input,protocolVersion:1};assert.equal(await commitment(context,digests),v.expected.commitment);
 if(v.expected.commitmentPreimageHex)assert.equal(hex(commitmentPreimage(context)),v.expected.commitmentPreimageHex);
 if(v.expected.streamMessage0Hex)assert.equal(hex(streamMessage(context,'dice-roll',0)),v.expected.streamMessage0Hex);
 for(let i=0;i<v.expected.hmacBlocks.length;i++)assert.equal(hex(await digests.hmacSha256(encode('hex32',context.serverSeed),streamMessage(context,context.gameId==='dice'?'dice-roll':'mines-layout',i))),v.expected.hmacBlocks[i]);
 const stream=new RandomStream(context,context.gameId==='dice'?'dice-roll':'mines-layout',digests);
 const consumed:number[]=[];const reader={async nextU32(){const c=await stream.nextU32();consumed.push(c);return c;}};
 if(context.gameId==='dice')assert.equal(await nextInt(reader,10000),v.expected.rollInt);
 else {const tiles=await shuffle(reader);assert.deepEqual(tiles,v.expected.permutation);assert.deepEqual(tiles.slice(0,context.wager.mineCount).sort((a,b)=>a-b),v.expected.mines);const replay=replayMines(v.expected.mines,context.wager.mineCount,context.actions.reveals,context.actions.end);assert.equal('terminal' in replay?replay.terminal:null,v.expected.informative.terminal);}
 assert.deepEqual(consumed,v.expected.candidatesConsumed);
});
for(const v of pf.negativeVectors)test(v.id,async()=>{
 if(v.id==='X-01'||v.id==='X-02'){const c={...pf.diceVectors[0].input,...v.tamperedField,protocolVersion:1};assert.equal(await commitment(c,digests),v.recomputedCommitment);assert.notEqual(v.recomputedCommitment,v.publishedCommitment);}
 else if(v.id==='X-03'||v.id==='X-04'){const base=pf.diceVectors[v.id==='X-03'?0:1];const c={...base.input,protocolVersion:1,clientSeed:v.clientSeed??v.clientSeedNfd};assert.equal(await commitment(c,digests),base.expected.commitment);assert.equal(await nextInt(new RandomStream(c,'dice-roll',digests),10000),v.expected.rollInt??v.expected.rollIntIfHashedAsGiven);}
 else {const base=pf.minesVectors.find(m=>m.id===v.baseVector)!;assert.deepEqual(replayMines(base.expected.mines,base.input.wager.mineCount,v.actions.reveals,v.actions.end),{error:v.expected.reason});}
});
