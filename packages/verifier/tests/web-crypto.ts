import { webcrypto } from 'node:crypto';
import type { DigestProvider } from '../dist/index.js';
export const digests:DigestProvider = {
  async sha256(message) { return new Uint8Array(await webcrypto.subtle.digest('SHA-256', Uint8Array.from(message))); },
  async hmacSha256(key,message) {
    const imported = await webcrypto.subtle.importKey('raw',Uint8Array.from(key),{name:'HMAC',hash:'SHA-256'},false,['sign']);
    return new Uint8Array(await webcrypto.subtle.sign('HMAC',imported,Uint8Array.from(message)));
  },
};
