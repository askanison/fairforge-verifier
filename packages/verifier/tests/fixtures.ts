import { Rational,approvedMathProfiles } from '../dist/index.js';
import type { MathProfile } from '../dist/index.js';
import { gm,type Fixture } from './vectors.ts';
export const fixtureProfiles:MathProfile[]=gm.registryFixtures.profiles.map((v:Fixture)=>({...v,nominalRtp:Rational.parse(v.nominalRtp)}));
export const fixtureRegistry=[...approvedMathProfiles,...fixtureProfiles];
