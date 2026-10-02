import type { DigestProvider } from '../crypto.js';
import { equalJson, exactKeys, integer, snapshotJson } from '../encoding/json.js';
import { matches, patterns, wellFormed } from '../encoding/primitives.js';
import { commitment, RandomStream, nextInt, shuffle } from '../fairness/stream.js';
import type { RoundContext } from '../fairness/stream.js';
import { parseAmount } from '../math/amount.js';
import { approvedMathProfiles, resolveProfile, snapshotRegistry } from '../math/profiles.js';
import type { MathProfileRegistry } from '../math/profiles.js';
import { diceState, minesState, payoutMath } from '../math/payout.js';
import type { PayoutMath } from '../math/payout.js';
import { object, wagerShape, pinned, positiveStake, mathShape } from './validation.js';
import { compareRecord } from './records.js';
import type { PlayerAction } from './records.js';
import { replayMines } from './replay.js';
export type ResultCode = 'VERIFIED' | 'NOT_REVEALED' | 'RECOVERED_NOT_VERIFIABLE' | 'FORMAT_ERROR' | 'UNSUPPORTED_VERSION' | 'COMMITMENT_MISMATCH' | 'CLIENT_RECORD_MISMATCH' | 'OUTCOME_MISMATCH' | 'INVALID_TILE' | 'ACTION_AFTER_TERMINAL' | 'MISSING_TERMINAL' | 'CASHOUT_WITHOUT_SAFE_TILE' | 'PAYOUT_MISMATCH';
export type VerificationResult = {
    result: Exclude<ResultCode, 'VERIFIED'>;
} | {
    result: 'VERIFIED';
    evidence: 'complete' | 'partial' | 'none';
    recordStatus: 'used' | 'absent' | 'unreadable';
    witnessedSeqs: number[];
    unwitnessedSeqs: number[];
};
export interface Verifier {
    verifyFull(payload: unknown, record?: unknown): Promise<VerificationResult>;
}
export function createVerifier(digests: DigestProvider, trustedRegistry: MathProfileRegistry = approvedMathProfiles): Verifier {
    const registry = snapshotRegistry(trustedRegistry);
    return { verifyFull: (payload, record) => verifyProcedure(digests, registry, payload, record, true) };
}
/** Test-only intermediate steps 1–8. Never export this as the UI's success operation. */
export function verifyFairnessForTests(digests: DigestProvider, registry: MathProfileRegistry, payload: unknown, record?: unknown): Promise<VerificationResult> { return verifyProcedure(digests, snapshotRegistry(registry), payload, record, false); }
async function verifyProcedure(digests: DigestProvider, registry: MathProfileRegistry, input: unknown, record: unknown, full: boolean): Promise<VerificationResult> {
    try { input = snapshotJson(input); } catch { return { result: 'FORMAT_ERROR' }; }
    try { record = snapshotJson(record); } catch { record = 'Unreadable record'; }
    const p = object(input);
    if (!p)
        return { result: 'FORMAT_ERROR' };
    if (Object.hasOwn(p, 'recovery'))
        return { result: 'RECOVERED_NOT_VERIFIABLE' };
    const round = object(p.round), f = object(p.fairness), math = object(p.math);
    const protocolVersion = integer(p.protocolVersion, 0, 65535);
    if (p.payloadType !== 'pfge-pf-verification' || integer(p.payloadVersion, 1, 1) !== 1 || p.protocol !== 'PFGE-PF' || protocolVersion === null || !round || !f || !math)
        return { result: 'FORMAT_ERROR' };
    if (!['commitmentId', 'roundId', 'casinoId', 'auditSubjectRef'].every(k => matches(round[k], patterns.uuid)) || !matches(round.gameId, patterns.gameId) || !matches(round.gameVersion, patterns.gameVersion) || !matches(f.commitment, patterns.hex32) || !matches(f.clientRandomness, patterns.hex32) || !wellFormed(f.clientSeed) || (f.serverSeed !== undefined && f.serverSeed !== null && !matches(f.serverSeed, patterns.hex32)))
        return { result: 'FORMAT_ERROR' };
    if (protocolVersion !== 1 || round.gameVersion !== '1.0.0' || (round.gameId !== 'dice' && round.gameId !== 'mines'))
        return { result: 'UNSUPPORTED_VERSION' };
    const game = round.gameId, w = object(p.wager), claimed = object(p.claimed), a = object(p.actions);
    if (!w || !claimed || !wagerShape(w, game))
        return { result: 'FORMAT_ERROR' };
    if (game === 'dice') {
        if (Object.hasOwn(p, 'actions') || !exactKeys(claimed, ['rollInt']) || integer(claimed.rollInt, 0, 9999) === null)
            return { result: 'FORMAT_ERROR' };
    }
    else {
        if (!a || !exactKeys(a, ['reveals', 'end']) || !Array.isArray(a.reveals) || (a.end !== null && (typeof a.end !== 'string' || !['cashout', 'timeout', 'access-revoked', 'lifetime-expired'].includes(a.end))) || !exactKeys(claimed, ['mines', 'terminal', 'safeRevealed']) || !Array.isArray(claimed.mines) || typeof claimed.terminal !== 'string' || !['mine-hit', 'cashout', 'auto-cashout-all-safe', 'timeout', 'access-revoked', 'lifetime-expired'].includes(claimed.terminal) || integer(claimed.safeRevealed, 0, 24) === null)
            return { result: 'FORMAT_ERROR' };
        // Shape requires non-decreasing tiles; count and duplicates belong to outcome comparison.
        const mines = claimed.mines.map(v => integer(v, 0, 24));
        if (mines.some(v => v === null) || mines.some((v, i) => i > 0 && v! < mines[i - 1]!))
            return { result: 'FORMAT_ERROR' };
    }
    if (!pinned(w.pinned))
        return { result: 'FORMAT_ERROR' };
    const profile = resolveProfile(registry, w.pinned.mathProfileId as string, w.pinned.mathProfileVersion as string);
    if (!profile || profile.gameId !== game || !profile.gameVersions.includes(round.gameVersion))
        return { result: 'UNSUPPORTED_VERSION' };
    if (!positiveStake(w.stake))
        return { result: 'FORMAT_ERROR' };
    const stake = parseAmount(w.stake), revealed = f.serverSeed !== undefined && f.serverSeed !== null;
    if (!mathShape(math, game, stake.precision, revealed))
        return { result: 'FORMAT_ERROR' };
    if (!revealed)
        return { result: 'NOT_REVEALED' };
    // These casts follow the complete primitive validation above.
    const context: RoundContext = {
        protocolVersion,
        commitmentId: round.commitmentId as string, roundId: round.roundId as string,
        casinoId: round.casinoId as string, auditSubjectRef: round.auditSubjectRef as string,
        gameId: round.gameId, gameVersion: round.gameVersion,
        serverSeed: f.serverSeed as string, clientSeed: f.clientSeed, clientRandomness: f.clientRandomness as string,
    };
    if (await commitment(context, digests) !== f.commitment)
        return { result: 'COMMITMENT_MISMATCH' };
    const playerActions: PlayerAction[] = game === 'dice' ? [] : (a!.reveals as unknown[]).map((tile, i) => ({ seq: i + 1, kind: 'reveal', tile }));
    if (game === 'mines' && a!.end === 'cashout')
        playerActions.push({ seq: playerActions.length + 1, kind: 'cashout' });
    const evidence = compareRecord(record, context.commitmentId, f, w, playerActions);
    if (evidence.result !== 'VERIFIED')
        return evidence;
    let result: PayoutMath['result'], multiplier: bigint | null;
    if (game === 'dice') {
        const roll = await nextInt(new RandomStream(context, 'dice-roll', digests), 10000);
        if (integer(claimed.rollInt, 0, 9999) !== roll)
            return { result: 'OUTCOME_MISMATCH' };
        const target = integer(w.targetInt, 0, 10000)!;
        result = (w.direction === 'under' ? roll < target : roll > target) ? 'win' : 'loss';
        try {
            multiplier = diceState(profile, w.direction === 'under' ? target : 9999 - target).multiplierUnits;
        }
        catch {
            return full ? { result: 'PAYOUT_MISMATCH' } : evidence;
        }
    }
    else {
        const m = integer(w.mineCount, 1, 24)!;
        const mines = (await shuffle(new RandomStream(context, 'mines-layout', digests))).slice(0, m).sort((a, b) => a - b);
        if (!equalJson(mines, claimed.mines))
            return { result: 'OUTCOME_MISMATCH' };
        const replay = replayMines(mines, m, a!.reveals as unknown[], a!.end as string | null);
        if ('error' in replay)
            return { result: replay.error as Exclude<ResultCode, 'VERIFIED'> };
        if (replay.terminal !== claimed.terminal || replay.safeRevealed !== integer(claimed.safeRevealed, 0, 24))
            return { result: 'OUTCOME_MISMATCH' };
        result = replay.result;
        multiplier = result === 'cashout' ? minesState(profile, m, replay.safeRevealed).multiplierUnits : null;
    }
    if (full && !equalJson(payoutMath(w.stake as string, result, multiplier), math))
        return { result: 'PAYOUT_MISMATCH' };
    return evidence;
}
