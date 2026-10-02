export const patterns = { uuid: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/, hex32: /^[0-9a-f]{64}$/, gameId: /^[a-z][a-z0-9-]{0,31}$/, gameVersion: /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/, purpose: /^[a-z][a-z0-9-]{0,63}$/ };
export function matches(value: unknown, pattern: RegExp): value is string { return typeof value === 'string' && pattern.exec(value)?.[0] === value; }
export function hex(bytes: Uint8Array): string { return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join(''); }
export function unhex(text: string): Uint8Array { return Uint8Array.from(text.match(/../g) ?? [], s => parseInt(s, 16)); }
export function utf8(value: string): Uint8Array {
    const bytes: number[] = [];
    for (const character of value) {
        const cp = character.codePointAt(0)!;
        if (cp >= 0xd800 && cp <= 0xdfff)
            throw new Error('LONE_SURROGATE');
        if (cp < 0x80)
            bytes.push(cp);
        else if (cp < 0x800)
            bytes.push(0xc0 | (cp >> 6), 0x80 | (cp & 63));
        else if (cp < 0x10000)
            bytes.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
        else
            bytes.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 63), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
    }
    return Uint8Array.from(bytes);
}
export function wellFormed(value: unknown): value is string { if (typeof value !== 'string')
    return false; try {
    utf8(value);
    return true;
}
catch {
    return false;
} }
export function concat(...parts: Uint8Array[]): Uint8Array { const bytes = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let offset = 0; for (const part of parts) {
    bytes.set(part, offset);
    offset += part.length;
} return bytes; }
export function uint(value: number, width: 2 | 4): Uint8Array { if (!Number.isSafeInteger(value) || value < 0 || value >= 2 ** (width * 8))
    throw new Error('INTEGER_RANGE'); return Uint8Array.from({ length: width }, (_, i) => (value / 2 ** (8 * (width - i - 1))) & 255); }
export function str(value: string): Uint8Array { const b = utf8(value); return concat(uint(b.length, 4), b); }
export function encode(type: keyof typeof patterns | 'u16' | 'u32' | 'str', value: unknown): Uint8Array {
    if (type === 'u16' || type === 'u32') {
        if (typeof value !== 'number')
            throw new Error('INTEGER_RANGE');
        return uint(value, type === 'u16' ? 2 : 4);
    }
    if (type === 'str') {
        if (typeof value !== 'string')
            throw new Error('LONE_SURROGATE');
        return str(value);
    }
    const errors = { uuid: 'NON_CANONICAL_UUID', hex32: 'NON_CANONICAL_HEX', gameId: 'INVALID_GAME_ID', gameVersion: 'INVALID_GAME_VERSION', purpose: 'INVALID_PURPOSE' };
    if (!matches(value, patterns[type]))
        throw new Error(errors[type]);
    return type === 'uuid' ? unhex(value.replace(/-/g, '')) : type === 'hex32' ? unhex(value) : str(value);
}
