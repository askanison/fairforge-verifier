import { equalJson, integer, isObject } from '../encoding/json.js';
import { recordReadable, object } from './validation.js';
import type { VerificationResult } from './verifier.js';
export interface PlayerAction {
    seq: number;
    kind: 'reveal' | 'cashout';
    tile?: unknown;
}
export function compareRecord(record: unknown, commitmentId: string, fairness: Record<string, unknown>, wager: Record<string, unknown>, actions: PlayerAction[]): VerificationResult {
    const readable = recordReadable(record);
    const status = record === undefined || record === null ? 'absent' : readable ? 'used' : 'unreadable';
    const witnessed: number[] = [];
    let submitted = false;
    if (readable) {
        if (record.commitmentId !== commitmentId)
            return { result: 'CLIENT_RECORD_MISMATCH' };
        const submission = object(record.submission);
        if (submission) {
            submitted = true;
            for (const field of ['commitment', 'clientSeed', 'clientRandomness'])
                if (submission[field] !== fairness[field])
                    return { result: 'CLIENT_RECORD_MISMATCH' };
            if (!equalJson(submission.wager, wager))
                return { result: 'CLIENT_RECORD_MISMATCH' };
        }
        if (Array.isArray(record.actions))
            for (const entry of record.actions) {
                if (!isObject(entry))
                    throw new Error('Readable record invariant');
                const seq = integer(entry.seq, 1, actions.length);
                const action = seq === null ? undefined : actions[seq - 1];
                if (!action || action.kind !== entry.kind || (action.kind === 'reveal' && !equalJson(action.tile, entry.tile)))
                    return { result: 'CLIENT_RECORD_MISMATCH' };
                witnessed.push(action.seq);
            }
    }
    witnessed.sort((a, b) => a - b);
    const unwitnessed = actions.filter(a => !witnessed.includes(a.seq)).map(a => a.seq);
    return { result: 'VERIFIED', evidence: submitted && unwitnessed.length === 0 ? 'complete' : submitted || witnessed.length > 0 ? 'partial' : 'none', recordStatus: status, witnessedSeqs: witnessed, unwitnessedSeqs: unwitnessed };
}
