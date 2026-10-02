import { assignedRanges, controlRanges, combiningClasses, decompositions, compositions } from './unicode/ucd16-data.generated.js';
const classes = new Map(combiningClasses.map(row => [row[0], row[1]]));
const decomposition = new Map(decompositions.map(row => [row[0], row.slice(1)]));
const composition = new Map(compositions.map(row => [`${row[0]},${row[1]}`, row[2]]));
const ccc = (cp: number) => classes.get(cp) ?? 0;
function inRanges(cp: number, ranges: readonly (readonly number[])[]): boolean {
    let low = 0, high = ranges.length - 1;
    while (low <= high) {
        const mid = (low + high) >> 1;
        const [start, end] = ranges[mid];
        if (cp < start)
            high = mid - 1;
        else if (cp > end)
            low = mid + 1;
        else
            return true;
    }
    return false;
}
function decompose(cp: number, result: number[]): void {
    if (cp >= 0xac00 && cp < 0xd7a4) {
        const index = cp - 0xac00;
        result.push(0x1100 + Math.floor(index / 588), 0x1161 + Math.floor(index % 588 / 28));
        if (index % 28)
            result.push(0x11a7 + index % 28);
        return;
    }
    const mapping = decomposition.get(cp);
    if (mapping) {
        for (const child of mapping)
            decompose(child, result);
    }
    else
        result.push(cp);
}
function compose(a: number, b: number): number | undefined {
    if (a >= 0x1100 && a < 0x1113 && b >= 0x1161 && b < 0x1176)
        return 0xac00 + (a - 0x1100) * 588 + (b - 0x1161) * 28;
    if (a >= 0xac00 && a < 0xd7a4 && (a - 0xac00) % 28 === 0 && b > 0x11a7 && b < 0x11c3)
        return a + b - 0x11a7;
    return composition.get(`${a},${b}`);
}
/** Pinned UCD16 canonical NFC; never used to transform verifier evidence. */
export function normalizeNfc(value: string): string {
    const decomposed: number[] = [];
    for (const ch of value)
        decompose(ch.codePointAt(0)!, decomposed);
    for (let i = 1; i < decomposed.length; i++) {
        const current = decomposed[i], rank = ccc(current);
        let j = i;
        if (rank)
            while (j > 0 && ccc(decomposed[j - 1]) > rank) {
                decomposed[j] = decomposed[j - 1];
                j--;
            }
        decomposed[j] = current;
    }
    const output: number[] = [];
    let starter = -1, lastClass = 0;
    for (const cp of decomposed) {
        const rank = ccc(cp);
        const combined = starter < 0 ? undefined : compose(output[starter], cp);
        if (combined !== undefined && (lastClass < rank || lastClass === 0)) {
            output[starter] = combined;
        }
        else {
            if (rank === 0)
                starter = output.length;
            output.push(cp);
            lastClass = rank;
        }
    }
    return output.map(cp => String.fromCodePoint(cp)).join('');
}
const whitespace = (cp: number) => cp >= 9 && cp <= 13 || cp === 32 || cp === 0x85 || cp === 0xa0 || cp === 0x1680 || cp >= 0x2000 && cp <= 0x200a || [0x2028, 0x2029, 0x202f, 0x205f, 0x3000].includes(cp);
export function validateClientSeed(value: string): string | null {
    const points = Array.from(value, ch => ch.codePointAt(0)!);
    if (points.length === 0)
        return 'EMPTY';
    if (points.length > 64)
        return 'TOO_LONG';
    if (points.some(cp => cp >= 0xd800 && cp <= 0xdfff))
        return 'SURROGATE';
    if (normalizeNfc(value) !== value)
        return 'NOT_NFC';
    if (whitespace(points[0]) || whitespace(points[points.length - 1]))
        return 'LEADING_OR_TRAILING_WHITESPACE';
    for (const cp of points) {
        if (inRanges(cp, controlRanges))
            return 'CONTROL_CHARACTER';
        if (!inRanges(cp, assignedRanges))
            return 'UNASSIGNED_CODE_POINT';
    }
    return null;
}
