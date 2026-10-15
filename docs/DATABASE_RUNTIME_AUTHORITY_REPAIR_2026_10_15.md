# Runtime authority forward repair

## Recovery provenance and boundaries

The earlier local commit `e27b08a5b87a4eed2d1cc6a633fbc94b359fa34d` was lost in a
workspace rollback before publication. This branch is a newly reconstructed and
revalidated source change, not a claim to have recovered that commit or tree.

The initial recovered migration was byte-identical to the previously reviewed
SQL, SHA-256
`4822b53c30a3820d5e0f7c95a35d1c284cce1f0f628a896f46a57cf4e758cbde`.
The first hosted database run then exposed a publication-wrapper composition
regression and an exact denial-reason compatibility issue. The corrected
migration is SHA-256
`ca0cc25dc6feae53cb6c865cfd9c9c775ddab6b2af075f57b5c1f64ccc143b8f`.
The original two resolver definitions remain an immutable before-control fixture,
not a claim that the current migration retains the earlier bytes.
The shared replay helper and several permission fixtures also match retained
file hashes. Other tests and this document were reconstructed and strengthened;
their previous test results do not certify this new source head.

Baseline: `535c56439a6fa0a855323dd8a5c6e8d1f1a43665`. The migration is
`20261015150707_runtime_authority_forward_repair.sql`. All existing migration
files remain immutable. The Studio migration `20261015073423` remains held for
old-client compatibility, and this repair does not depend on applying it.

No production deployment, provider operation or migration-history mutation is
authorized by this source repair, publication or merge.

## Exact repair scope

Fifteen existing functions are replaced in place, retaining identities,
signatures, defaults and owners:

1. `has_platform_role(text[])`
2. `has_platform_permission(text)`
3. `is_platform_owner_user(text)`
4. `has_active_beta_access()`
5. `resolve_sandbox_monetization_tester(text,text)`
6. `grant_sandbox_monetization_tester(text,text,timestamptz,text)`
7. `admin_grant_platform_role_by_email(text,text,text)`
8. `admin_grant_platform_role_by_email_pre_subject_closeout(text,text,text)`
9. `admin_grant_platform_role_by_email_pre_exact_subject_closure(text,text,text)`
10. `watch_party_room_access_pre_live_decouple(text,text)`
11. `resolve_watch_party_livekit_authority_pre_service_fix(text,uuid,uuid)`
12. `watch_party_room_self_access_allowed_internal(text,text)`
13. `resolve_watch_party_livekit_viewer_authority(text,uuid,uuid)`
14. `admin_grant_platform_role_by_email(text,text,text,text)`
15. `apply_revenuecat_terminal_quarantine_projection_internal(uuid)`

The migration also restores two exact active/unexpired self-read policy
predicates, preserves the Owner review branch, restores only `service_role`
EXECUTE on the beta/tester predicates, and removes two inert obsolete Watch Party
membership INSERT/UPDATE policies. Table write grants remain unchanged.

### Staff, beta and sandbox

The repair combines canonical exact-subject/session checks with deployed current
account-legal acceptance. Explicit tester ID/email arguments must still match
the caller. Missing, removed, banned, unconfirmed and ambiguous target subjects
cannot receive a staff grant. Historical predecessor functions stay inaccessible
and delegate without recursion.

Mutation paths use the wall clock after waits rather than transaction-start
`now()`. They recheck the exact session and current legal/account authority,
role and scoped permission after writes. The operation-key wrapper repeats the
check after its final receipt INSERT, using the returned immutable target ID.
An Owner who loses that role cannot fall back to Operator self-grant authority.

Actor-bound historical receipt retries preserve their original result semantics:
they need a current exact legal session, but do not make a new role mutation or
require the old staff role to remain current. New grants require current role
and scope through completion. Request fingerprinting, advisory key, conflict
handling and receipt payload semantics are retained.

### Party and LiveKit

This is cumulative reconciliation, not replacement with weaker historical
canonical bodies. It preserves current creator-money/legal authority, quarantine,
target finite-Premium access, exact nonterminal transaction links for both stores
and purchase-session legal acceptance. Exact product/source/buyer/creator/host,
environment, price/currency and ticket identity are enforced together.

Boolean paid authority and token expiry use the same proof predicates. Blank
original transaction IDs deny. Both paid host and buyer expiry are capped by the
exact supplied session cutoff; another loosely matched ticket cannot extend TTL.

Viewer and host must exist and be nondeleted/unrestricted before an early allow
or fallback. Ordinary room authority does not gain an email-only sign-in rule.
Trusted null-generation enforcement retains its separate fresh-membership path.
The current service resolver rejects noncanonical room IDs before older wrappers
can normalize them and skip the middle Live paid-pass gate.

Restored target Premium authority can now make a predecessor succeed rather than
entering a newer publication fallback. Public/Circle nonpaid Premium and Party
Pass rooms therefore enforce current publication and fresh exact membership on
that successful path too. Prepared-only rooms, retired publications, host leave,
and stale/left/removed memberships deny. Supplied-session proofs intersect the
30-second bound, session cutoff, host/viewer Premium expiry and any prior TTL.
Invalid supplied sessions retain `viewer_session_authority_invalid`.

Exact captured-production testing also identified a separate pre-existing gap:
null-generation target enforcement could retain a retired public publication.
The approved adjacent correction requires current publication in that same
public/Circle branch. Successful target enforcement still returns its original
no-token-expiry result; no viewer JWT requirement is invented. Never-published
private title access remains supported in both relevant modes.

### Durable host quarantine

Previously, quarantine demoted an admitted host to viewer/listener, violating
the immutable host-identity trigger. The transaction rolled back the quarantine
marker itself and left authority active. The narrow correction preserves the
existing host identity fields for the exact room host while marking membership
removed, recording departure and disabling media. Nonhosts remain demoted.
The identity trigger and every unrelated trigger are unchanged.

Existing scope remains: grants are quarantined by provider/user/environment;
membership removal covers that user across paid/Premium rooms. An unaffected
other-provider grant may still authorize its current session, while its
null-generation path loses fresh membership. Free nonpaid rooms are unaffected.

## Retained and newly strengthened tests

Run portable full-schema/controlled regressions:

```sh
node --test --test-concurrency=1 tests/database-runtime-*-repair.test.mjs
```

The shared builder replays the 424-file chain without Studio and a separate
425-file chain with Studio. Managed auth/storage scaffolds contain schema only;
no production rows or credentials are used. Four exact documented extension or
empty-data calls are excluded, and unexpected replay errors fail.

The reconstructed live overlay is explicit about provenance: the repaired
authority bodies and retained paid-ticket projector are matched to captured
production hashes. One untouched function's previously established
whitespace-only variation could not be recovered byte-for-byte and is labeled
as canonical equivalent formatting. It is not silently counted as exact
production-definition recovery. No cancelled catalog read is bypassed.

Catalog tests compare function identities/OIDs/ABI, scope, ACLs, policies,
relations, columns, constraints, indexes, triggers, enums, sequences,
publications and repeat-apply idempotence. Permission tests use real role-switched
RLS and actual account/session/legal predicates. Full-schema mutation tests
contain captured-live failing controls, exact target/retry/conflict cases,
wall-clock cutoff checks and post-write fault injection with complete row-level
rollback snapshots. Fault triggers are not described as real concurrency.

Controlled paid tests mutate synthetic proof rows and clearly label dependency
doubles. Separate full-schema paid tests use actual event processors, exact
transaction links, legal/session/creator functions, retained projector, normal
authenticated joins and the current public service resolver. Both stores run
with Studio absent and present. Committed host quarantine is followed by new
queries proving durable markers, removed membership, identity preservation,
denied read/rejoin/heartbeat, duplicate idempotence and unaffected free scope.

Four existing pgTAP fixtures receive current same-session legal setup. Their
positive ordinary/staff assertions are retained. One fabricated tester-identity
expectation is tightened to match the preserved deployed binding, with matching
and omitted-argument positives. Production guards are never weakened for tests.
The Chilly closure fixture additionally receives its missing current buyer legal
acceptance and exact nonterminal transaction link; all 146 original assertion
statements remain byte-identical.

The Party composition regression has separate exact captured-production and
initial-candidate failing controls. Its declared 42 cases per Studio lane bind
full allow/deny envelopes, actual leave/removal RPCs, current/retired/missing
publications, Circle source checks, private legacy positives, and independently
short host/viewer Premium projections through the real provider event processor.
The before fixture is SHA-256
`e7fa34c25b498f4860032837604216da5ab0d121dc53645f035836028f7bc7ee`.

### Native queue gate

The required database job directly invokes:

```sh
node scripts/test-database-runtime-authority-concurrency.mjs
```

This runner accepts only a local Supabase CLI Docker container and operates in a
generated disposable clone. It verifies distinct holder/waiter backends and the
exact blocking PID relation, starts the waiter before finite authority cutoffs,
commits invalidation in a third connection, observes expiry while still blocked,
then releases the lock. Both the operation-key advisory wait and final receipt
INSERT wait are tested. Audit/receipt Owner-to-Operator self fallback is included.

Expected cases include captured-live failures, valid queued grants/retries,
session expiry/deletion, caller account/legal invalidation, role/scope
expiry/revocation and actor-bound historical receipt semantics. Denial must have
the exact intended error and preserve full role/audit/receipt snapshots. A final
declared case count prevents silent omissions. Source syntax or PGlite success
does not substitute for executing this runner on native PostgreSQL.

## Validation and rollout gates

PGlite uses PostgreSQL 18; production is PostgreSQL 17. Native Supabase pgTAP,
queue, HTTP/PostgREST/realtime, provider-transport and paired-browser results must
be reported separately. The final reconstructed commit needs protected Required
Validation at that exact head before merge. Missing or failed jobs are not
passing evidence, and the lost commit's earlier receipt is not reused.
The first native pgTAP run executed 111 files and 4,355 assertions and failed 21
assertions across three fixtures. Local exact-SQL replays reproduce those
failures and verify the corrections without weakening their assertions. A fresh
passing native run and the subsequent real queue runner remain required.

Any later production rollout requires separate authorization, a fresh complete
425-record history fingerprint and the exact reviewed migration hash. An
isolated staging directory can contain actual applied-version filenames/bodies
plus only this repair, excluding Studio and disabling seed/role loading. A
canonical pinned-CLI dry-run must list only the repair. Offline inventory
comparison is not that dry-run. Ordinary repository-wide `db push` would include
held Studio and must not be used. Do not invent skip records or rewrite history.
Later Studio rollout needs its own explicit reviewed order plan.
