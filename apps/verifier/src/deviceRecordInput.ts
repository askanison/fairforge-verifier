import { parseVerificationJson } from '@fairforge/verifier';

export function parseDeviceRecord(raw: string): unknown {
  try { return parseVerificationJson(raw); }
  catch { return {}; }
}

/** Provisional read-only adapter convention; real player creation/integration is M04/M07. */
export function readDeviceRecord(commitmentId: string): unknown {
  try {
    const raw = localStorage.getItem(`pfge-pf:device-record:${commitmentId}`);
    return raw === null ? undefined : parseDeviceRecord(raw);
  } catch { return {}; }
}
