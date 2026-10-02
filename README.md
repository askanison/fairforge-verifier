# Fairforge public verifier source

Independent PFGE-PF v1 / PFGE-GM v1 verifier and manual browser app.
Vector set 1.0.0 has 289 public entries; internal seed-at-rest fixtures are excluded.

Requires Node 26.10.0 and npm 11.19.1. Run npm ci, npm test, npm run typecheck,
npm run build and npm run check:pack. Runtime core has no dependencies or I/O.
MIT source includes Unicode 16.0.0 derived tables under Unicode License V3;
retain LICENSE and UNICODE-LICENSE.txt with source and distributions.

source-receipt.json pins the reviewed source inputs; app dist/build-identity.json
contains matching build-time base commit, dirty flag and package version.
Receipts are content correspondence evidence, not authenticated provenance.
The base commit is not a new exact commit when dirty is true.
The release tag and deployed identity must be verified against the published receipts.
Retain historical algorithm/profile source, vectors and built artifacts for seven years.
Verification does not prove wallet settlement or absence of selective rejection.
