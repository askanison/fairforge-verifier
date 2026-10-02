/** Internal normalized decimal: coefficient × 10^exponent, without large powers. */
export class ExactNumber {
    readonly coefficient: string;
    readonly exponent: bigint;
    constructor(token: string) {
        const match = /^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(token);
        if (!match)
            throw new SyntaxError('Invalid number');
        let digits = (match[2] + (match[3] ?? '')).replace(/^0+/, '');
        let exponent = BigInt(match[4] ?? '0') - BigInt((match[3] ?? '').length);
        if (!digits) {
            this.coefficient = '0';
            this.exponent = 0n;
            return;
        }
        const trimmed = digits.replace(/0+$/, '');
        exponent += BigInt(digits.length - trimmed.length);
        digits = trimmed;
        this.coefficient = match[1] + digits;
        this.exponent = exponent;
    }
    key(): string { return `${this.coefficient}e${this.exponent}`; }
    positiveInteger(): boolean { return this.coefficient !== '0' && this.coefficient[0] !== '-' && this.exponent >= 0n; }
    bounded(min: number, max: number): number | null {
        if (this.coefficient === '0')
            return min <= 0 && max >= 0 ? 0 : null;
        if (this.exponent < 0n || this.exponent > 15n || this.coefficient.replace('-', '').length + Number(this.exponent) > 16)
            return null;
        const value = Number(this.coefficient) * 10 ** Number(this.exponent);
        return Number.isSafeInteger(value) && value >= min && value <= max ? value : null;
    }
}
export function numeric(value: unknown): ExactNumber | null {
    if (value instanceof ExactNumber)
        return value;
    return typeof value === 'number' && Number.isFinite(value) ? new ExactNumber(String(value)) : null;
}
export function integer(value: unknown, min: number, max: number): number | null { return numeric(value)?.bounded(min, max) ?? null; }
/** Parse JSON before native number rounding. Duplicate members select their last value. */
export function parseVerificationJson(text: string): unknown {
    let pos = 0;
    const fail = (): never => { throw new SyntaxError(`Invalid JSON at offset ${pos}`); };
    const space = () => { while (pos < text.length && /[\x20\t\n\r]/.test(text[pos]))
        pos++; };
    const string = (): string => {
        const start = pos++;
        while (pos < text.length) {
            const c = text[pos++];
            if (c === '"')
                return JSON.parse(text.slice(start, pos)) as string;
            if (c === '\\')
                pos++;
        }
        return fail();
    };
    const value = (): unknown => {
        space();
        const c = text[pos];
        if (c === '"')
            return string();
        if (c === '{' || c === '[') {
            pos++;
            space();
            const object: Record<string, unknown> = Object.create(null);
            const array: unknown[] = [];
            const end = c === '{' ? '}' : ']';
            if (text[pos] === end) {
                pos++;
                return c === '{' ? object : array;
            }
            while (true) {
                if (c === '{') {
                    if (text[pos] !== '"')
                        return fail();
                    const key = string();
                    space();
                    if (text[pos++] !== ':')
                        return fail();
                    object[key] = value();
                }
                else
                    array.push(value());
                space();
                if (text[pos] === end) {
                    pos++;
                    return c === '{' ? object : array;
                }
                if (text[pos++] !== ',')
                    return fail();
                space();
            }
        }
        for (const [token, result] of [['true', true], ['false', false], ['null', null]] as const) {
            if (text.startsWith(token, pos)) {
                pos += token.length;
                return result;
            }
        }
        const token = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/.exec(text.slice(pos))?.[0];
        if (!token)
            return fail();
        pos += token.length;
        return new ExactNumber(token);
    };
    const result = value();
    space();
    if (pos !== text.length)
        fail();
    return result;
}
export function equalJson(a: unknown, b: unknown): boolean {
    const an = numeric(a), bn = numeric(b);
    if (an || bn)
        return !!an && !!bn && an.key() === bn.key();
    if (a === b)
        return true;
    if (Array.isArray(a) || Array.isArray(b))
        return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => equalJson(v, b[i]));
    if (!isObject(a) || !isObject(b))
        return false;
    const keys = Object.keys(a);
    return keys.length === Object.keys(b).length && keys.every(k => Object.hasOwn(b, k) && equalJson(a[k], b[k]));
}
export function isObject(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof ExactNumber); }
export function exactKeys(value: Record<string, unknown>, keys: string[]): boolean { return Object.keys(value).length === keys.length && keys.every(k => Object.hasOwn(value, k)); }
/** One detached input tree for every step, including through asynchronous providers. */
export function snapshotJson(value: unknown, ancestors = new Set<object>()): unknown {
    if (value instanceof ExactNumber)
        return Object.freeze(new ExactNumber(value.key()));
    if (typeof value === 'number')
        return numeric(value) ?? value;
    if (value === null || typeof value !== 'object')
        return value;
    if (ancestors.has(value))
        throw new TypeError('Cyclic value is not JSON');
    ancestors.add(value);
    try {
        if (Array.isArray(value)) {
            const detached: unknown[] = [];
            for (let index = 0; index < value.length; index++) {
                if (!Object.hasOwn(value, index))
                    throw new TypeError('Sparse arrays are not JSON');
                detached.push(snapshotJson(value[index], ancestors));
            }
            return Object.freeze(detached);
        }
        const detached: Record<string, unknown> = Object.create(null);
        for (const key of Object.keys(value))
            detached[key] = snapshotJson((value as Record<string, unknown>)[key], ancestors);
        return Object.freeze(detached);
    } finally {
        ancestors.delete(value);
    }
}
