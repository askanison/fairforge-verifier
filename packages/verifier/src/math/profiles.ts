import { Rational } from './rational.js';
export interface MathProfile {
    readonly mathProfileId: string;
    readonly mathProfileVersion: string;
    readonly gameId: 'dice' | 'mines';
    readonly gameVersions: readonly string[];
    readonly nominalRtp: Rational;
}
export type MathProfileRegistry = readonly MathProfile[];
export const approvedMathProfiles: MathProfileRegistry = Object.freeze((['dice', 'mines'] as const).flatMap(gameId => [99, 98, 97].map(rtp => Object.freeze({ mathProfileId: `${gameId}-rtp-${rtp}`, mathProfileVersion: '1.0.0', gameId, gameVersions: Object.freeze(['1.0.0']), nominalRtp: Object.freeze(new Rational(BigInt(rtp), 100n)) }))));
export function resolveProfile(registry: MathProfileRegistry, id: string, version: string): MathProfile | undefined { return registry.find(p => p.mathProfileId === id && p.mathProfileVersion === version); }
/** Detach injected trusted data so caller mutation cannot replace a retained profile. */
export function snapshotRegistry(registry: MathProfileRegistry): MathProfileRegistry {
    return Object.freeze(registry.map(profile => Object.freeze({
        mathProfileId: profile.mathProfileId,
        mathProfileVersion: profile.mathProfileVersion,
        gameId: profile.gameId,
        gameVersions: Object.freeze([...profile.gameVersions]),
        nominalRtp: Object.freeze(new Rational(profile.nominalRtp.n, profile.nominalRtp.d)),
    })));
}
