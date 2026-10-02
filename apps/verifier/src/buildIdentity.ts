declare const __VERIFIER_BUILD__: Readonly<{ sourceCommit: string | null; dirty: boolean | null; packageVersion: string }>;

// Vite replaces this constant at build time. Payloads and browser globals cannot set it.
export const buildIdentity = Object.freeze(__VERIFIER_BUILD__);
