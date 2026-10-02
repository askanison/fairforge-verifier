# @fairforge/verifier

MIT-licensed independent pure TypeScript deterministic core for `PFGE-PF` v1 and
`PFGE-GM` v1. It reproduces the commitment, Dice/Mines outcomes, action history and
exact payout from supplied evidence. It has no React, I/O, native crypto, runtime
dependency, private import or seed-at-rest implementation.

```ts
import { createVerifier, parseVerificationJson } from '@fairforge/verifier';
import type { DigestProvider } from '@fairforge/verifier';

// Supply an asynchronous SHA-256/HMAC-SHA256 bytes adapter in your application.
const verifier = createVerifier(digests as DigestProvider);
const payload = parseVerificationJson(payloadText);
const record = recordText === undefined ? undefined : parseVerificationJson(recordText);
const result = await verifier.verifyFull(payload, record);
```

Both digest methods must return exactly 32 bytes. Provider unavailability, rejection
or invalid output rejects the operation as an execution error; it never produces a
protocol success or a fabricated result code. The host owns its crypto adapter and
presents execution failures separately. Corrupt record JSON can be supplied as an
unreadable sentinel (for example a non-null string); an absent/null record means no
record was supplied. Invalid payload JSON throws a parse error at ingestion.

Use `parseVerificationJson` for raw paste/file/import ingestion. It preserves number
lexemes as internal normalized decimal coefficient/exponent values before rounding
or Infinity, without allocating exponent-sized powers. It preserves JSON string
escapes literally, including lone surrogates; explicit UTF-8 fields reject lone
surrogates at their prescribed verification step. Duplicate JSON member names use
their last value, and `__proto__` remains an ordinary own member. This is a parsed
JSON evidence boundary and makes no raw-transport canonicality claim. Each verification detaches and normalizes payload/record once before awaited
crypto; the trusted registry is deeply snapshotted at verifier creation. The returned
value is opaque and should be passed to the verifier directly, not JSON.stringify'd.

`verifyFull(unknown)` also accepts already-decoded JSON values. Such numbers mean
the actual supplied JavaScript values; their original unrounded lexemes cannot be
recovered. Bounded protocol/game controls are integral and safe. Device-record
sequences are integral and at least 1, with no maximum. Canonical positive stake
strings have no arbitrary integer-digit cap; settlement precision is 0–18, payable
multiplier precision is 4, and pre-rounding precision is `p + 4`.

The default trusted registry contains exactly six approved `1.0.0` profiles:
`dice-rtp-99/98/97` and `mines-rtp-99/98/97`. A host may explicitly inject a trusted
historical registry; payload fields never supply trust or implicitly register a
fixture profile. Historical profiles must remain available for retained rounds.

`validateClientSeed(string): string | null` independently applies the ordered
engine admission rules with pinned Unicode 16.0.0 tables. It rejects non-NFC input
rather than changing it. Full verification never calls admission validation and
hashes exact recorded UTF-8, including NFD. Protocol/game/math identities and the
frozen vector set remain unchanged.

A `VERIFIED` result includes `evidence`, `recordStatus`, `witnessedSeqs` and
`unwitnessedSeqs`. The host must present the prescribed evidence-specific wording:
complete evidence checks the submitting device's record and every player action;
partial evidence must list exactly what was checked and what remains reported by
the operator; none checks only internal consistency. An unreadable record is
explicitly reported and wholly discarded. Verification does not prove wallet
settlement, absence of selective rejection, honest client code or authentic
unwitnessed action history. Intermediate steps 1–8 are available only from an
internal test entry point, not the package's full-success operation.

Run `npm test` in this package (build then tests against `dist`) or
`npm test --workspace=@fairforge/verifier` from the private development workspace.
Tests use explicit test-only Web Crypto adapters and trusted fixture registries.
The package source directory is independently installable and buildable; public
publication, distribution packaging and milestone acceptance are separate steps.

Distribution is explicitly enumerated: all 17 reviewed TypeScript modules and their
JavaScript/declaration artifacts, compiler config and notices. `check:pack` installs
an actual tarball in a disposable consumer, compares every installed file/digest and
imports the public API without the workspace. Keep `LICENSE` (MIT) and
`UNICODE-LICENSE.txt` (Unicode License V3) with source and built distributions; the
Unicode 16.0.0 tables include data under that notice.

A standalone public source export includes already-reviewed projected vectors and
official Unicode test inputs. Its tests use those local inputs without a private
exporter; all inventory, semantic digests and exact numeric lexemes are still checked.
Retain historical algorithm/profile versions, vectors and built artifacts for the
seven-year verification window. Proposed release `0.1.0` / tag `v0.1.0` has not been
created: current source/package metadata remains `0.0.0`. Build receipts describe
source content and an existing base commit plus dirty status, not an authenticated
public tag or deployed identity.
