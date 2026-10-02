import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseAmount,formatAmount,Rational,approvedMathProfiles,diceState,minesState,diceMaxWinOutcomes,effectiveRtp,stakeRtp,roundingLoss,payoutMath } from '../dist/index.js';
import { continuousMinimum } from '../dist/math/availability.js';
import { gm,type Fixture } from './vectors.ts';
import { digests } from './web-crypto.ts';
import { hex,utf8 } from '../dist/encoding/primitives.js';
import type { MathProfile } from '../dist/index.js';
import { fixtureRegistry as registry } from './fixtures.ts';
function profile(v:Fixture):MathProfile{return registry.find(p=>p.mathProfileId===v.mathProfileId&&p.mathProfileVersion===v.mathProfileVersion)!;}
function state(v:Fixture){const s=v.state??v.config.dice??v.config.mines;return s.winOutcomes!==undefined?diceState(profile(v),s.winOutcomes):minesState(profile(v),s.mineCount,s.safeRevealed);}
for(const v of gm.amountVectors)test(v.id,()=>{
 if(v.expected.error)assert.throws(()=>parseAmount(v.text,v.precision),{message:v.expected.error});
 else {const amount=parseAmount(v.text,v.precision);assert.equal(String(amount.minor),v.expected.minor);assert.equal(amount.precision,v.expected.precision);assert.equal(formatAmount(amount.minor,amount.precision),v.text);}
});
for(const v of gm.mathProfiles)test(`profile ${v.mathProfileId}/${v.mathProfileVersion}`,()=>{
 const p=profile(v);assert.equal(p.nominalRtp.toString(),Rational.parse(v.nominalRtp).toString());assert.equal(p.gameId,v.gameId);assert.deepEqual(p.gameVersions,v.gameVersions);if(v.diceWinOutcomes)assert.deepEqual([1,diceMaxWinOutcomes(p)],v.diceWinOutcomes);
});
for(const v of gm.diceMultiplierVectors)test(v.id,()=>{
 if(v.expected.error)assert.throws(()=>diceState(profile(v),v.winOutcomes),{message:v.expected.error});
 else {const s=diceState(profile(v),v.winOutcomes);assert.equal(profile(v).nominalRtp.div(s.probability).toString(),v.expected.exactMultiplier);assert.equal(formatAmount(s.multiplierUnits,4),v.expected.payableMultiplier);assert.equal(effectiveRtp(s).toString(),v.expected.effectiveTheoreticalRtp);}
});
for(const v of gm.diceTableDigests)test(v.id,async()=>{
 const p=profile(v),rows:string[]=[];let min=new Rational(1n);
 for(let w=1;w<=diceMaxWinOutcomes(p);w++){const s=diceState(p,w),etr=effectiveRtp(s);rows.push(`${w},${formatAmount(s.multiplierUnits,4)},${etr}`);if(etr.compare(min)<0)min=etr;assert.ok(s.multiplierUnits>10000n);}
 assert.equal(rows.length,v.rows);assert.equal(rows[0],v.firstRow);assert.equal(rows.at(-1),v.lastRow);assert.equal(hex(await digests.sha256(utf8(rows.join('\n')+'\n'))),v.sha256);assert.equal(min.toString(),v.minEffectiveTheoreticalRtp);
});
for(const v of gm.minesTables)test(v.id,()=>{
 assert.equal(v.rows.length,300);
 for(const row of v.rows){const s=minesState(profile(v),row.mineCount,row.safeRevealed);assert.equal(s.probability.toString(),row.probability);assert.equal(formatAmount(s.multiplierUnits,4),row.payableMultiplier);assert.equal(effectiveRtp(s).toString(),row.effectiveTheoreticalRtp);let product=new Rational(1n);for(let k=0;k<row.safeRevealed;k++)product=product.mul(new Rational(BigInt(25-row.mineCount-k),BigInt(25-k)));assert.equal(product.toString(),s.probability.toString());}
});
for(const v of gm.payoutVectors)test(v.id,()=>{
 const s=state(v),a=parseAmount(v.stake),math=payoutMath(v.stake,'win',s.multiplierUnits);
 for(const k of ['payableMultiplier','preRoundingPayout','payout'] as const)assert.equal(math[k],v.expected[k]);
 assert.equal(effectiveRtp(s).toString(),v.expected.effectiveTheoreticalRtp);assert.equal(stakeRtp(s,a.minor).toString(),v.expected.stakeSpecificRtp);assert.equal(roundingLoss(s,a.minor).toString(),v.expected.roundingLoss);
 assert.equal(a.minor*s.multiplierUnits/10000n>a.minor&&roundingLoss(s,a.minor).compare(new Rational(1n,1000n))<=0,v.expected.passesSafeguards);
});
for(const v of gm.availabilityVectors)test(v.id,()=>{
 const min=parseAmount(v.lattice.min),inc=parseAmount(v.lattice.increment).minor;
 const states=v.config.dice?[diceState(profile(v),v.config.dice.winOutcomes)]:Array.from({length:25-v.config.mines.mineCount},(_,i)=>minesState(profile(v),v.config.mines.mineCount,i+1));
 const maxM=states.reduce((m,s)=>s.multiplierUnits>m?s.multiplierUnits:m,0n);
 const cap=((parseAmount(v.maxPayout).minor+1n)*10000n-1n)/maxM;
 const maximum=cap<parseAmount(v.maxBet).minor?cap:parseAmount(v.maxBet).minor;
 const latticeMax=exposureMaximum(parseAmount(v.maxBet).minor,parseAmount(v.maxPayout).minor,maxM,min.minor,inc);
 assert.equal(latticeMax,maximum<min.minor?null:min.minor+(maximum-min.minor)/inc*inc);
 const found=latticeMax===null?null:continuousMinimum(states,{minimum:min.minor,increment:inc,maximum:latticeMax,theta:Rational.parse(v.roundingLossLimit)});
 assert.equal(found!==null,v.expected.available);assert.equal(found===null?null:formatAmount(found,min.precision),v.expected.minStake);
 assert.equal(found===null?null:formatAmount(latticeMax!,min.precision),v.expected.maxStake);
 assert.equal(found===null?null:formatAmount(latticeMax!,min.precision),v.expected.exposureMaxStake);
 const threshold=states.reduce((z,s)=>{const t=(10000n+s.multiplierUnits-10001n)/(s.multiplierUnits-10000n);return t>z?t:z;},0n);
 assert.equal(formatAmount(threshold,min.precision),v.expected.zeroProfitThreshold);
 for(const isolated of v.expected.isolatedPassingStakesBelowMin??[]){const stake=parseAmount(isolated).minor;assert.ok(found!==null&&stake<found);assert.ok(states.every(s=>stake*s.multiplierUnits/10000n>stake&&roundingLoss(s,stake).compare(Rational.parse(v.roundingLossLimit))<=0));}
});
for(const v of gm.minesSummaryVectors)test(v.id,()=>{
 const a=parseAmount(v.stake);let worst=new Rational(1n);const indices:number[]=[];
 for(const row of v.expected.perCashout){const s=minesState(profile(v),v.mineCount,row.safeRevealed);const rtp=stakeRtp(s,a.minor);assert.equal(formatAmount(a.minor*s.multiplierUnits/10000n,a.precision),row.payout);assert.equal(rtp.toString(),row.stakeSpecificRtp);if(rtp.compare(worst)<0){worst=rtp;indices.length=0;}if(rtp.compare(worst)===0)indices.push(row.safeRevealed);}
 assert.equal(worst.toString(),v.expected.summaryStakeSpecificRtp);assert.deepEqual(indices,v.expected.worstSafeRevealed);
});
test('exhaustive small domains compare continuous minimum to descending definition',()=>{
 const limits=['0/1','1/100000','1/10000','1/3000','1/1000'];let cases=0;
 for(let a=1;a<=7;a++)for(let d=1;d<=5;d++)for(const maximum of [15n,35n,70n])for(const thetaText of limits)for(const units of [10001n,10100n,12857n,19800n,30000n]){
  const states=[{probability:new Rational(1n,2n),multiplierUnits:units},{probability:new Rational(3n,4n),multiplierUnits:units+10000n}];const theta=Rational.parse(thetaText);let expected:bigint|null=null;
  for(let s=BigInt(a)+(maximum-BigInt(a))/BigInt(d)*BigInt(d);s>=BigInt(a);s-=BigInt(d)){if(states.some(v=>s*v.multiplierUnits/10000n<=s||v.probability.n*((s*v.multiplierUnits)%10000n)*theta.d>theta.n*v.probability.d*10000n*s))break;expected=s;}
  assert.equal(continuousMinimum(states,{minimum:BigInt(a),increment:BigInt(d),maximum,theta}),expected,`${a}/${d}/${maximum}/${thetaText}/${units}`);cases++;
 }
 assert.equal(cases,2625);
});
import { nextAutoBetStake,exposureMaximum,passesSafeguards } from '../dist/index.js';
for(const v of gm.autoBetVectors)test(v.id,()=>{
 const asset=gm.assets[v.asset],p=asset.p;
 const result=nextAutoBetStake(parseAmount(v.previousStake).minor,parseAmount(v.baseStake).minor,v.previousWon?v.onWin:v.onLoss,parseAmount(asset.min).minor,parseAmount(asset.inc).minor,parseAmount(v.effectiveMinStake).minor,parseAmount(v.maxStake).minor);
 assert.deepEqual('nextStake' in result?{nextStake:formatAmount(result.nextStake,p)}:result,v.expected);
});
for(const percent of ['-1','1000.01','1.001','1e2','10\n'])test(`auto-bet rejects ${JSON.stringify(percent)}`,()=>assert.throws(()=>nextAutoBetStake(1000n,1000n,{action:'increase',percent},1000n,100n,1000n,1000000n),/INVALID_PERCENT/));
test('all four named acceptance checks execute exact engine math',()=>{
 assert.equal(gm.acceptanceChecks.length,4);
 // BR-RISK-007: all approved Mines configurations, four demo assets.
 for(const p of approvedMathProfiles.filter(p=>p.gameId==='mines'))for(let m=1;m<=24;m++)for(const assetId of ['DEMO_USD','DEMO_USDT','DEMO_BTC','DEMO_ETH']){
  const asset=gm.assets[assetId],a=parseAmount(asset.min),d=parseAmount(asset.inc).minor;
  const states=Array.from({length:25-m},(_,i)=>minesState(p,m,i+1));const maxM=states.at(-1)!.multiplierUnits;
  const maximum=exposureMaximum(1000n*10n**BigInt(asset.p),1000000n*10n**BigInt(asset.p),maxM,a.minor,d);
  assert.notEqual(maximum,null);assert.notEqual(continuousMinimum(states,{minimum:a.minor,increment:d,maximum:maximum!,theta:new Rational(1n,1000n)}),null);
 }
 // BR-CUR-007: all99% Dice chances preserve the4-decimal0.10 baseline.
 const dice=approvedMathProfiles[0];for(let w=1;w<=diceMaxWinOutcomes(dice);w++){const state=diceState(dice,w);assert.equal(continuousMinimum([state],{minimum:1000n,increment:100n,maximum:10000000n,theta:new Rational(1n,1000n)}),1000n);}
 for(const profile of registry.filter(p=>p.gameId==='dice'))for(let w=1;w<=diceMaxWinOutcomes(profile);w++)assert.ok(diceState(profile,w).multiplierUnits>10000n);
 // Max12/13-mine multiplier; and highest97% Dice zero-profit threshold.
 const mines=approvedMathProfiles.find(p=>p.mathProfileId==='mines-rtp-99')!;
 for(const m of [12,13])assert.equal(formatAmount(minesState(mines,m,25-m).multiplierUnits,4),'5148297.0000');
 const dice97=approvedMathProfiles.find(p=>p.mathProfileId==='dice-rtp-97')!;const s=diceState(dice97,9699);
 assert.equal(s.multiplierUnits,10001n);assert.equal(9999n*s.multiplierUnits/10000n,9999n);assert.equal(10000n*s.multiplierUnits/10000n,10001n);
});
test('3000 seeded independent descending oracles with one to four states and all strictness limits',()=>{
 let seed=20260927;const next=(bound:number)=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%bound;};
 const thetaPairs=[[0n,1n],[1n,100000n],[1n,10000n],[1n,3000n],[1n,1000n]];
 for(let i=0;i<3000;i++){
  const a=BigInt(1+next(20)),d=BigInt(1+next(10)),maximum=a+BigInt(next(150))*d;
  const [tn,td]=thetaPairs[next(thetaPairs.length)];const inputs=Array.from({length:1+next(4)},()=>{const pd=BigInt(2+next(100));return {pn:BigInt(1+next(Number(pd))),pd,units:BigInt(10000+next(100000))};});
  let expected:bigint|null=null;
  for(let s=maximum;s>=a;s-=d){if(inputs.some(v=>s*v.units/10000n<=s||v.pn*(s*v.units%10000n)*td>tn*v.pd*10000n*s))break;expected=s;}
  const states=inputs.map(v=>({probability:new Rational(v.pn,v.pd),multiplierUnits:v.units}));
  assert.equal(continuousMinimum(states,{minimum:a,increment:d,maximum,theta:new Rational(tn,td)}),expected,`seeded domain ${i}`);
 }
});
test('huge minor-unit domains remain bounded and theta0 is exact',()=>{
 const huge=10n**60n;const state={probability:new Rational(1n,2n),multiplierUnits:19800n};
 assert.equal(continuousMinimum([state],{minimum:1n,increment:1n,maximum:huge,theta:new Rational(0n)}),huge);
 assert.equal(continuousMinimum([state],{minimum:1n,increment:1n,maximum:huge+1n,theta:new Rational(0n)}),null);
 assert.equal(continuousMinimum([{...state,multiplierUnits:10000n}],{minimum:1n,increment:1n,maximum:huge,theta:new Rational(1n,1000n)}),null);
});

for (const [label,base,effectiveMin,maximum,expected] of [
 ['offset floor',15n,11n,100n,{nextStake:14n}],
 ['valid lower lattice',14n,11n,100n,{nextStake:14n}],
 ['valid upper lattice',17n,11n,100n,{nextStake:17n}],
 ['below lattice',10n,11n,100n,{stop:'BELOW_EFFECTIVE_MIN'}],
 ['below effective after floor',15n,15n,100n,{stop:'BELOW_EFFECTIVE_MIN'}],
 ['above maximum after floor',18n,11n,16n,{stop:'ABOVE_MAX_STAKE'}],
 ['floor enters maximum',18n,11n,17n,{nextStake:17n}],
] as const) test(`final contract reset ${label}`,()=>assert.deepEqual(nextAutoBetStake(99n,base,{action:'reset'},11n,3n,effectiveMin,maximum),expected));
