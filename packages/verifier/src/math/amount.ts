export interface Amount {
    minor: bigint;
    precision: number;
}
export function parseAmount(value: unknown, precision?: number, maxPrecision = 18): Amount {
    if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(value) || value.endsWith('\n'))
        throw new Error('INVALID_AMOUNT');
    const p = value.includes('.') ? value.length - value.indexOf('.') - 1 : 0;
    if (p > maxPrecision || (precision !== undefined && p !== precision))
        throw new Error('INVALID_AMOUNT');
    return { minor: BigInt(value.replace('.', '')), precision: p };
}
export function formatAmount(minor: bigint, precision: number): string { if (minor < 0n || !Number.isInteger(precision) || precision < 0 || precision > 22)
    throw new Error('INVALID_AMOUNT'); const digits = minor.toString().padStart(precision + 1, '0'); return precision === 0 ? digits : digits.slice(0, -precision) + '.' + digits.slice(-precision); }
