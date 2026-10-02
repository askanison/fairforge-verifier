import { floorLattice } from './availability.js';
export type AutoBetAction = {
    action: 'reset';
} | {
    action: 'increase';
    percent: string;
};
export type AutoBetResult = {
    nextStake: bigint;
} | {
    stop: 'BELOW_EFFECTIVE_MIN' | 'ABOVE_MAX_STAKE';
};
export function nextAutoBetStake(previous: bigint, base: bigint, action: AutoBetAction, minimum: bigint, increment: bigint, effectiveMin: bigint, maximum: bigint): AutoBetResult {
    let next = base;
    if (action.action === 'increase') {
        if (!/^[0-9]+(?:\.[0-9]{1,2})?$/.test(action.percent) || action.percent.endsWith('\n'))
            throw new Error('INVALID_PERCENT');
        const [whole, fraction = ''] = action.percent.split('.');
        const hundredths = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
        if (hundredths > 100000n)
            throw new Error('INVALID_PERCENT');
        next = floorLattice(previous * (10000n + hundredths) / 10000n, minimum, increment) ?? 0n;
    }
    else {
        next = floorLattice(base, minimum, increment) ?? 0n;
    }
    if (next < effectiveMin)
        return { stop: 'BELOW_EFFECTIVE_MIN' };
    if (next > maximum)
        return { stop: 'ABOVE_MAX_STAKE' };
    return { nextStake: next };
}
