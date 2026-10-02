import { Rational, binomial } from './rational.js';
import { formatAmount, parseAmount } from './amount.js';
import type { MathProfile } from './profiles.js';
export interface MathState {
    probability: Rational;
    multiplierUnits: bigint;
}
export function diceMaxWinOutcomes(profile: MathProfile): number { return Math.min(9800, Number(profile.nominalRtp.n * 10000n / profile.nominalRtp.d - 1n)); }
export function diceState(profile: MathProfile, w: number): MathState { if (!Number.isInteger(w) || w < 1 || w > diceMaxWinOutcomes(profile))
    throw new Error('WAGER_NOT_PERMITTED'); return { probability: new Rational(BigInt(w), 10000n), multiplierUnits: profile.nominalRtp.n * 100000000n / (profile.nominalRtp.d * BigInt(w)) }; }
export function minesState(profile: MathProfile, m: number, k: number): MathState { if (!Number.isInteger(m) || !Number.isInteger(k) || m < 1 || m > 24 || k < 1 || k > 25 - m)
    throw new Error('WAGER_NOT_PERMITTED'); const p = new Rational(binomial(25 - m, k), binomial(25, k)); return { probability: p, multiplierUnits: profile.nominalRtp.n * 10000n * p.d / (profile.nominalRtp.d * p.n) }; }
export function effectiveRtp(state: MathState): Rational { return state.probability.mul(new Rational(state.multiplierUnits, 10000n)); }
export function stakeRtp(state: MathState, stake: bigint): Rational { return state.probability.mul(new Rational(stake * state.multiplierUnits / 10000n, stake)); }
export function roundingLoss(state: MathState, stake: bigint): Rational { return effectiveRtp(state).sub(stakeRtp(state, stake)); }
export interface PayoutMath {
    result: 'win' | 'loss' | 'cashout' | 'refund';
    payableMultiplier: string | null;
    preRoundingPayout: string;
    payout: string;
}
export function payoutMath(stakeText: string, result: PayoutMath['result'], multiplier: bigint | null): PayoutMath {
    const stake = parseAmount(stakeText);
    const product = (result === 'win' || result === 'cashout') ? stake.minor * multiplier! : 0n;
    return { result, payableMultiplier: multiplier === null ? null : formatAmount(multiplier, 4), preRoundingPayout: formatAmount(product, stake.precision + 4), payout: formatAmount(product / 10000n, stake.precision) };
}
