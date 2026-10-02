export interface DigestProvider {
    sha256(message: Uint8Array): Promise<Uint8Array>;
    hmacSha256(key: Uint8Array, message: Uint8Array): Promise<Uint8Array>;
}
export async function digest32(operation: Promise<Uint8Array>): Promise<Uint8Array> {
    const bytes = await operation;
    if (!(bytes instanceof Uint8Array) || bytes.length !== 32)
        throw new Error('Digest provider must return 32 bytes');
    return bytes;
}
