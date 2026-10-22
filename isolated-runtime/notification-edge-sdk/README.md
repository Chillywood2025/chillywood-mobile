# Notification Edge transport fixture

This test-only dependency tree loads the exact official SDK imported by
`supabase/functions/notification-device-tokens/index.ts`: 2.110.6. It is separate
from the mobile application's vendored 2.100.0-chillywood.1 SDK and its overrides.
It is not a production dependency, a provider integration, or a deployment.

From the repository root, prepare it in CI or locally with:

```sh
npm ci --ignore-scripts --no-audit --no-fund --prefix isolated-runtime/notification-edge-sdk
node isolated-runtime/notification-edge-sdk/verify.mjs
```

Use Node 22 or later, matching the SDK's published engine requirement. If the
default npm cache is not writable, append `--cache=/tmp/notification-edge-sdk-cache`.
Do not use `npm install` in CI or replace the fixture with the mobile SDK. Commit
both manifests when intentionally updating the pinned Edge import. Tests fail
with an installation instruction rather than skipping if this fixture is absent.

The committed lock records official `registry.npmjs.org` tarball URLs and SHA-512
SRI integrity for every transitive dependency. `npm ci` verifies downloaded or
cached bytes against those locked digests. `verify.mjs` also checks the specific
SDK SRI obtained from official npm metadata, the Edge import, the dependency
tree's isolation and exact installed versions. No install scripts run.

The fixture substitutes only local HTTP/auth/native boundaries. Whole production
mobile modules and the whole Edge handler execute through their respective real
SDKs. It does not prove Deno hosting behavior, native push delivery, or concurrent
PostgreSQL locks; tests using PGlite prove deterministic request interleavings.
