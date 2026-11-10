# Normal-app paid-video Studio

Source-only repair of normal `com.chillywood.mobile` authoring. No provider,
deployment, migration, product activation, credential or control change is made.
The original 48-module native installation remains byte-for-byte unchanged.
`authoring.sql` is a forward extension, not a fresh-install substitute or a
replayable deployment packet. Its exact predecessor definitions and privilege
envelope require a separately reviewed forward installation.

## Product surface and authority

The existing paid-video V2 contract is the selected feature contract:
`sandbox-commerce-v1/paid-video-contract-v2.json`. Normal iOS/Android use the
existing `/sandbox-videos` home, studio, upload, offer, history and status routes,
shared branded frame, media-source picker, V2 actions, durable request/transfer
journals and authenticated authoring/upload endpoints. V1/V2 debug flavors remain
separate. V3 still requires its own native module evidence; mixed flavors reject.

`SHA256("native-paid-video-authoring-v1")` selects the native authoring protocol.
It is public metadata, not build attestation or authorization. Supabase's exact
current account/session, creator eligibility, legal authority, server-only
profile and every media gate remain required. Free buyers may read published
offers; they cannot upload, inspect a creator's private draft or retire an offer.

Native media admission is independent of Test Store V3 checkout. An empty,
default-off private profile must be qualified against the current gateway route,
worker, verifier and evidence before upload. Reusing the native digest as a V3
profile rejects. Reserve, upload, probe, publication and recovery cannot switch
between native and V3 mode. V3's existing changed-profile recovery is preserved.

## Publication

Native publication preserves the original request journal, ownership, expected
revision, immutable object receipt, accepted scanner evidence, fresh definitions,
clear moderation, immutable asset/version and quota checks. Its only different
producer is a narrowly approved native catalog template, never a caller SKU/URL.

The core catalog has one price anchor per kind/amount/currency. Native anchors
must be RevenueCat one-time USD paid-content anchors and cannot be admitted by
the V3 catalog/product relations. Approved templates independently bind each
store's exact project/app/product and qualification evidence. Zero templates or
more than one active template for a store holds publication. Play-only and
Apple-only are supported; the missing platform remains unavailable. Two approved
stores produce two exact native resource/asset bindings using one price anchor.

Template identities/revisions and publication provenance are immutable. Template
disable/append-only retirement stops future publication, not already issued
bindings; withdrawing an existing offer uses its normal retirement or the
existing native binding retirement controls. Publication and template changes
serialize with NOWAIT locks. No generic client/service template writer is added.

Publication does not qualify SDK dispatch, purchase, receipt settlement or access.
`checkoutAvailable` remains false for native authoring. Opening a published code
or its explicit native quote button only navigates to the existing normal-app
quote screen. That screen independently enforces the exact native catalog,
current buyer/creator/media, store-specific quote and dispatch qualification,
Play license-tester/test-sheet confirmation, durable interruption recovery and
protected player. Missing platform catalog data never falls back to legacy SKUs.

## Storage, operations and rollout boundaries

The existing AWS S3 VersionId, immutable create-only upload, independent HMAC
verifier/scanner, moderation and current pre/post-I/O access contracts are
unchanged. R2 and other S3-compatible providers are not qualified by this repair.
No object receipt, scan, moderation decision or test media is seeded.

A real deployment still needs the reviewed forward source installation, current
V2 Edge handlers and gateway configuration, a genuinely qualified storage route,
independent verifier/scanner credentials and genuine media evidence. Existing
`ops/isolated-paid-video-operations-v2` provides the narrowly bound worker and
authenticated reviewer source; its installation and operator/reviewer authority
must be explicitly reviewed rather than granting broad private function access.
No arbitrary hash, local MP4 probe or service token establishes moderation.

Effective EAS environment values and installed binary identity must be checked
separately. This repair makes no speculative build-flag change. A source merge
does not establish a rebuilt/signed/installed normal Android or iOS app.
Other products, legacy consumers, payment providers and live money stay outside
this change. Roll back UI selection through a normal source change and disable
new authoring controls; retain immutable requests, transfers and offers for
recovery rather than deleting historical evidence.

## Verification

`authoring.native.mjs --local-bin /absolute/postgresql-17.6/bin` runs the exact
frozen baseline plus the forward source in a disposable loopback-only cluster.
It exercises actual HTTP/SQL, FORCE RLS/grants, ordinary buyer/creator separation,
unknown transfers, forged verifier proof, scan/moderation holds, Unicode and
ambiguous templates, Play-only/dual-store publication, concurrency rollback,
idempotent recovery and mixed-mode rejection. Auth/origin/scanner facts are
explicitly synthetic. This is not cloud-provider, malware-scanner or device proof.

Mounted tests cover normal iOS/Android upload/publication, shared offer navigation
without V3 checkout, lost PUT and new-session recovery. Existing V3, native quote,
Play handoff and player suites remain required. Shared backgrounds, 48-point
buttons, accessibility labels and explicit source-sheet cancellation are retained.
Physical native purchase, restore, first-frame, lifecycle and installed visual
golden cases remain platform-specific validation after authorized rollout.
