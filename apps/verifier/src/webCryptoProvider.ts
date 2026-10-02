import type { DigestProvider } from '@fairforge/verifier';

function subtle(): SubtleCrypto {
  if (!globalThis.crypto?.subtle) throw new Error('Web Crypto unavailable');
  return globalThis.crypto.subtle;
}

export const webCryptoProvider: DigestProvider = {
  async sha256(message) {
    return new Uint8Array(await subtle().digest('SHA-256', Uint8Array.from(message)));
  },
  async hmacSha256(key, message) {
    const provider = subtle();
    const imported = await provider.importKey('raw', Uint8Array.from(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    return new Uint8Array(await provider.sign('HMAC', imported, Uint8Array.from(message)));
  },
};
