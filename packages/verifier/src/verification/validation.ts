import { exactKeys, integer, isObject, numeric } from '../encoding/json.js';
import { matches, patterns, wellFormed } from '../encoding/primitives.js';
import { parseAmount } from '../math/amount.js';
export type ObjectValue = Record<string, unknown>;
export const object = (v: unknown): ObjectValue | null => isObject(v) ? v : null;
export function positiveStake(v: unknown): boolean { try {
    return parseAmount(v).minor > 0n;
}
catch {
    return false;
} }
export function pinned(v: unknown): v is ObjectValue { return isObject(v) && exactKeys(v, ['mathProfileId', 'mathProfileVersion', 'limitsVersion']) && matches(v.mathProfileId, patterns.purpose) && matches(v.mathProfileVersion, patterns.gameVersion) && matches(v.limitsVersion, /^[1-9][0-9]{0,9}$/); }
export function wagerShape(v: unknown, game: 'dice' | 'mines'): v is ObjectValue {
    if (!isObject(v) || !exactKeys(v, game === 'dice' ? ['direction', 'targetInt', 'stake', 'currency', 'pinned'] : ['mineCount', 'stake', 'currency', 'pinned']) || typeof v.stake !== 'string' || typeof v.currency !== 'string' || v.currency.length === 0)
        return false;
    return game === 'dice' ? (v.direction === 'under' || v.direction === 'over') && integer(v.targetInt, 0, 10000) !== null : integer(v.mineCount, 1, 24) !== null;
}
export function mathShape(v: ObjectValue, game: 'dice' | 'mines', p: number, revealed: boolean): boolean {
    if (!revealed)
        return Object.keys(v).length === 0;
    if (!exactKeys(v, ['result', 'payableMultiplier', 'preRoundingPayout', 'payout']) || typeof v.result !== 'string' || !(game === 'dice' ? ['win', 'loss'] : ['cashout', 'loss', 'refund']).includes(v.result))
        return false;
    try {
        if (!(game === 'mines' && v.payableMultiplier === null))
            parseAmount(v.payableMultiplier, 4);
        parseAmount(v.preRoundingPayout, p + 4, 22);
        parseAmount(v.payout, p);
        return true;
    }
    catch {
        return false;
    }
}
export function recordReadable(record: unknown): record is ObjectValue {
    if (!isObject(record) || !matches(record.commitmentId, patterns.uuid))
        return false;
    if (record.submission !== undefined && record.submission !== null) {
        const s = object(record.submission);
        if (!s || !matches(s.commitment, patterns.hex32) || !matches(s.clientRandomness, patterns.hex32) || !wellFormed(s.clientSeed) || typeof s.submittedAt !== 'string' || !(wagerShape(s.wager, 'dice') || wagerShape(s.wager, 'mines')))
            return false;
        const w = s.wager;
        if (!pinned(w.pinned) || !positiveStake(w.stake))
            return false;
    }
    if (record.actions !== undefined && record.actions !== null) {
        if (!Array.isArray(record.actions))
            return false;
        const seen = new Set<string>();
        for (const entry of record.actions) {
            if (!isObject(entry))
                return false;
            const seq = numeric(entry.seq);
            if (!seq?.positiveInteger() || seen.has(seq.key()) || typeof entry.requestId !== 'string' || entry.requestId.length === 0)
                return false;
            seen.add(seq.key());
            if (entry.kind === 'reveal') {
                if (integer(entry.tile, 0, 24) === null)
                    return false;
            }
            else if (entry.kind !== 'cashout' || (entry.tile !== undefined && entry.tile !== null))
                return false;
        }
    }
    return true;
}
