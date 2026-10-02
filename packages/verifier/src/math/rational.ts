export function gcd(a: bigint, b: bigint): bigint { while (b !== 0n) {
    [a, b] = [b, a % b];
} return a < 0n ? -a : a; }
export class Rational {
    readonly n: bigint;
    readonly d: bigint;
    constructor(n: bigint, d: bigint = 1n) { if (d === 0n)
        throw new Error('Zero denominator'); if (d < 0n) {
        n = -n;
        d = -d;
    } const g = gcd(n, d); this.n = n / g; this.d = d / g; }
    static parse(text: string): Rational { const [n, d] = text.split('/'); return new Rational(BigInt(n), BigInt(d ?? '1')); }
    mul(other: Rational): Rational { return new Rational(this.n * other.n, this.d * other.d); }
    div(other: Rational): Rational { return new Rational(this.n * other.d, this.d * other.n); }
    sub(other: Rational): Rational { return new Rational(this.n * other.d - other.n * this.d, this.d * other.d); }
    compare(other: Rational): number { const v = this.n * other.d - other.n * this.d; return v < 0n ? -1 : v > 0n ? 1 : 0; }
    toString(): string { return `${this.n}/${this.d}`; }
}
export function ceil(n: bigint, d: bigint): bigint { return (n + d - 1n) / d; }
export function binomial(n: number, k: number): bigint { let value = 1n; for (let i = 1; i <= k; i++)
    value = value * BigInt(n - i + 1) / BigInt(i); return value; }
