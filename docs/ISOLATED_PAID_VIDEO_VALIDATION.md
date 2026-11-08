# Isolated PaidVideo source validation

The required `database-isolated-sandbox-native` job runs both the existing
isolated commerce qualification and the PaidVideo successor. Changes to the
PaidVideo routes, clients, components, tests, worker, SQL, or CI configuration
select this job. Its output does not authorize installation or provider use.

The PaidVideo runner executes these stages sequentially:

| Stage | Required result |
| --- | --- |
| Authoring with actual local scanner | 10 native groups |
| Gateway | 13 native groups |
| Fresh capture-composed runtime | 31 native groups |
| Runtime with retained, sealed capture evidence | 19 native groups |
| Operations with actual local scanner | 11 native groups |
| Local Auth, PostgREST, and four production Edge entries | 103 HTTP cases |
| App successor | 262 Node tests |
| Provider, recovery, and operations contracts | 82 Node tests |
| Local object transport | 2 Node tests |
| Exact profile binding | 16 Node tests |
| Published baseline materialization | 7 Node tests |
| Proof validation | 10 Node tests |
| Platform HTTP response compatibility | 7 Node tests |

Every required Node stage rejects skips. The separate existing canonical lane
includes the 19 Library tests. The current app qualification is therefore 288
tests: 262 app tests, 19 Library tests, and 7 platform HTTP bridge tests. The
historical 48-response and first retained 103-response bridge files keep their
original contracts; the successor invokes only the versioned platform bridge.
No responses are renamed or manufactured to satisfy a historical count.

The caller creates a fresh 32-hex-character attempt ID and an exact evidence
directory. The HTTP producer binds both to its owned Docker project, summary,
and cleanup. The aggregator compares those values to the caller's retained
expectation, checks all 99 execution inputs and 21 evidence files, and verifies
the four image identities against the pinned raw index, platform manifest, and
config chain. It records the start time before executing the producer and
rejects stale files. Copying old artifacts with new timestamps does not satisfy
the independent attempt identity. The platform app bridge receives that same
identity separately from its proof and capture files.

Only bounded summary, aggregate proof, and prerequisite reports are uploaded.
Private fixture directories, credentials, captures, raw logs, and generated
native projects are excluded. All actual fixture resources and sessions must
be cleaned up before a proof passes.

Hosted prerequisites are prepared by
`scripts/ci/paid-video-prerequisites/provision.py` on the supported ephemeral
Ubuntu runner. It verifies the pinned public ClamAV package and signature,
uses signed Ubuntu package metadata for FFmpeg, obtains fresh signed scanner
definitions, and verifies the exact Deno and Docker inputs. Missing packages,
registry throttling, or stale definitions fail the job. Local scanner state is
not evidence that hosted provisioning succeeded.

For a local disposable run, supply verified PostgreSQL 17.6 binaries, scanner
definitions, certificates, and Deno. The output directory must be new and
outside the checkout:

```sh
node scripts/ci/paid-video-validation.mjs \
  --local-bin /absolute/postgres17.6/bin \
  --output-dir /absolute/new-private-evidence \
  --database /absolute/verified-scanner-database \
  --certificates /absolute/trusted-scanner-certificates \
  --deno /absolute/deno
```

The baseline materializer reads exact Git trees and checks each source blob.
The published V2 baseline is commit
`0d1d3b3a959295dfc44a6485ab8f7067d933bb43`, tree
`5e9b8f86792c2fab606ed216037aec916f094b7c`; historical local commit IDs are not
executable dependencies. No working-tree fallback supplies a missing baseline.

Native compilation is a separate required job. Normal Expo prebuild runs under
the reviewed package configuration before the disposable Crypto source-compile
override. Fresh autolinking must then resolve the actual native module and
ExpoCrypto sources before Android or unsigned iOS compilation. This fixture
ordering does not relax the product plugin or change a release cohort.
