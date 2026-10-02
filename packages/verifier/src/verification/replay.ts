import { integer } from '../encoding/json.js';
import type { ResultCode } from './verifier.js';
export type ReplayResult = {
    terminal: string;
    safeRevealed: number;
    result: 'loss' | 'cashout' | 'refund';
} | {
    error: ResultCode;
};
export function replayMines(mines: number[], m: number, reveals: unknown[], end: string | null): ReplayResult {
    const tiles = reveals.map(v => integer(v, 0, 24));
    if (tiles.some(v => v === null) || new Set(tiles).size !== tiles.length)
        return { error: 'INVALID_TILE' };
    let safe = 0;
    for (let i = 0; i < tiles.length; i++) {
        const hit = mines.includes(tiles[i]!);
        if (!hit)
            safe++;
        if (hit || safe === 25 - m) {
            if (i !== tiles.length - 1 || end !== null)
                return { error: 'ACTION_AFTER_TERMINAL' };
            return { terminal: hit ? 'mine-hit' : 'auto-cashout-all-safe', safeRevealed: safe, result: hit ? 'loss' : 'cashout' };
        }
    }
    if (end === null)
        return { error: 'MISSING_TERMINAL' };
    if (end === 'cashout' && safe === 0)
        return { error: 'CASHOUT_WITHOUT_SAFE_TILE' };
    return { terminal: end, safeRevealed: safe, result: safe ? 'cashout' : 'refund' };
}
