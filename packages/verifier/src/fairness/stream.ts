import type { DigestProvider } from '../crypto.js';
import { digest32 } from '../crypto.js';
import { concat, encode, hex, str, uint } from '../encoding/primitives.js';
export interface RoundContext {
    protocolVersion: number;
    commitmentId: string;
    roundId: string;
    casinoId: string;
    auditSubjectRef: string;
    gameId: string;
    gameVersion: string;
    serverSeed: string;
    clientSeed: string;
    clientRandomness: string;
}
export function commitmentPreimage(c: RoundContext): Uint8Array { return concat(str('PFGE-PF/v1/commitment'), uint(c.protocolVersion, 2), encode('uuid', c.commitmentId), encode('uuid', c.roundId), encode('uuid', c.casinoId), encode('uuid', c.auditSubjectRef), encode('gameId', c.gameId), encode('gameVersion', c.gameVersion), encode('hex32', c.serverSeed)); }
export async function commitment(c: RoundContext, digests: DigestProvider): Promise<string> { return hex(await digest32(digests.sha256(commitmentPreimage(c)))); }
export function streamMessage(c: RoundContext, purpose: string, counter: number): Uint8Array { return concat(str('PFGE-PF/v1/stream'), uint(c.protocolVersion, 2), encode('uuid', c.commitmentId), encode('uuid', c.casinoId), encode('uuid', c.auditSubjectRef), encode('gameId', c.gameId), encode('gameVersion', c.gameVersion), encode('uuid', c.roundId), str(c.clientSeed), encode('hex32', c.clientRandomness), encode('purpose', purpose), uint(counter, 4)); }
export interface CandidateReader {
    nextU32(): Promise<number>;
}
export class RandomStream implements CandidateReader {
    private block: Uint8Array = new Uint8Array(0);
    private pos = 32;
    private counter = 0;
    constructor(private readonly context: RoundContext, private readonly purpose: string, private readonly digests: DigestProvider) { }
    async nextU32(): Promise<number> { if (this.pos === 32) {
        if (this.counter >= 2 ** 32)
            throw new Error('STREAM_COUNTER_EXHAUSTED');
        this.block = await digest32(this.digests.hmacSha256(encode('hex32', this.context.serverSeed), streamMessage(this.context, this.purpose, this.counter++)));
        this.pos = 0;
    } const p = this.pos; this.pos += 4; return this.block[p] * 16777216 + this.block[p + 1] * 65536 + this.block[p + 2] * 256 + this.block[p + 3]; }
}
export async function nextInt(reader: CandidateReader, n: number): Promise<number> { if (!Number.isInteger(n) || n < 1 || n > 2 ** 32)
    throw new Error('INVALID_BOUND'); const limit = Math.floor(2 ** 32 / n) * n; while (true) {
    const c = await reader.nextU32();
    if (!Number.isInteger(c) || c < 0 || c >= 2 ** 32)
        throw new Error('INVALID_CANDIDATE');
    if (c < limit)
        return c % n;
} }
export async function shuffle(reader: CandidateReader): Promise<number[]> { const tiles = Array.from({ length: 25 }, (_, i) => i); for (let i = 0; i < 24; i++) {
    const j = i + await nextInt(reader, 25 - i);
    [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
} return tiles; }
