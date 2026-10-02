import { ceil, gcd, Rational } from './rational.js';
import type { MathState } from './payout.js';
export interface StakeDomain {
    minimum: bigint;
    increment: bigint;
    maximum: bigint;
    theta: Rational;
}
export function passesSafeguards(states: readonly MathState[], stake: bigint, theta: Rational): boolean {
    return states.every(s => stake * s.multiplierUnits / 10000n > stake && s.probability.n * ((stake * s.multiplierUnits) % 10000n) * theta.d <= theta.n * s.probability.d * 10000n * stake);
}
export function floorLattice(value: bigint, minimum: bigint, increment: bigint): bigint | null { if (increment <= 0n || minimum <= 0n)
    throw new Error('INVALID_LATTICE'); return value < minimum ? null : minimum + (value - minimum) / increment * increment; }
/** Exact residue-class search; bounded to at most 10000 iterations per state. */
export function continuousMinimum(states: readonly MathState[], domain: StakeDomain): bigint | null {
    const { minimum: a, increment: d, maximum, theta } = domain;
    if (a <= 0n || d <= 0n || theta.n < 0n || theta.compare(new Rational(1n, 1000n)) > 0 || states.length === 0)
        throw new Error('INVALID_DOMAIN');
    if (maximum < a || states.some(s => s.multiplierUnits <= 10000n))
        return null;
    const z = states.reduce((max, s) => { const threshold = ceil(10000n, s.multiplierUnits - 10000n); return threshold > max ? threshold : max; }, 0n);
    const n0 = z <= a ? 0n : ceil(z - a, d), nMax = (maximum - a) / d;
    if (n0 > nMax)
        return null;
    let lastFail = n0 - 1n;
    for (const s of states) {
        const period = 10000n / gcd(d * s.multiplierUnits, 10000n);
        if (nMax - n0 + 1n <= period) {
            for (let n = n0; n <= nMax; n++)
                if (!passesSafeguards([s], a + n * d, theta) && n > lastFail)
                    lastFail = n;
        }
        else
            for (let residue = 0n; residue < period; residue++) {
                const remainder = ((a + residue * d) * s.multiplierUnits) % 10000n;
                if (remainder === 0n)
                    continue;
                let bound = nMax;
                if (theta.n !== 0n) {
                    const maxBadStake = (s.probability.n * remainder * theta.d - 1n) / (s.probability.d * 10000n * theta.n);
                    if (maxBadStake < a)
                        continue;
                    const bad = (maxBadStake - a) / d;
                    if (bad < bound)
                        bound = bad;
                }
                if (bound < residue)
                    continue;
                const last = residue + (bound - residue) / period * period;
                if (last >= n0 && last > lastFail)
                    lastFail = last;
            }
    }
    return lastFail >= nMax ? null : a + (lastFail + 1n) * d;
}
export function exposureMaximum(maxBet: bigint, maxPayout: bigint, maxMultiplierUnits: bigint, minimum: bigint, increment: bigint): bigint | null {
    if (maxMultiplierUnits <= 0n || maxBet < 0n || maxPayout < 0n)
        throw new Error('INVALID_EXPOSURE');
    const cap = ((maxPayout + 1n) * 10000n - 1n) / maxMultiplierUnits;
    return floorLattice(cap < maxBet ? cap : maxBet, minimum, increment);
}
