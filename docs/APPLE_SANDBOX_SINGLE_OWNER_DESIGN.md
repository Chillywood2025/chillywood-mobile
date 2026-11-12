# Existing Apple paid-video SKU handover (source proposal, not activation)

Publication base: PR709 head `6e921310fa8e48baff69c16e1645bcf9dda4ec3f`. No provider or database changes have been made.

## Current source status

The complete source is composed by `isolated-runtime/native-store-apple-ownership-v1/source.mjs`.
The standalone ownership fragment intentionally aborts, so it cannot be
installed without the recorder and positive-effect fence. Composition does not
execute SQL or seed ownership, credentials, provider settings or activation.

The installed-base PostgreSQL 17.6 test replays the full legacy chain and exact
native modules, installs only in its disposable local database, and checks
qualification, native binding/revision, first receipt, replay, terminal-first,
retirement, no positive grant, pending recovery, wrong scope/subject rejection,
service-only execution and concurrent lock behavior. Existing function bodies,
permissions, role memberships and public schema ACL are unchanged. The test
is registered in the existing isolated-native CI job with a 20-minute step limit.

Ordinary candidate-SKU transactions share a nonblocking fence; only handover
qualification and retirement are exclusive. Old-snapshot transactions are
rejected for these four sandbox SKUs even before ownership exists. Production,
Google and unrelated SKUs bypass this fence. A busy transition is retryable,
not proof that a purchase completed. Ownership/catalog retirement closes new
admission but preserves already-admitted settlement and terminal reconciliation.

Focused SQL/actual-handler tests use synthetic provider facts. They are not
Apple/RevenueCat delivery proof or installed-phone proof. Hosted exact-head CI,
deployment authorization, provider configuration and normal-app verification
remain separate. The design history below records the reviewed decisions.

## Objective and existing contract

Reuse `com.chillywood.paidvideo.tier1` through `tier4` for the normal native sandbox flow, without duplicate products, credits or access. Retain public catalog mappings for production and all unrelated consumers.

The shared handler runs legacy processing and native journal intake concurrently; native reconciliation/ACK waits for both and a private legacy exclusion callback. It does not simply route around the legacy consumer. The legacy webhook accepts only exact ignored purchase or missing-terminal-binding outcomes, then calls the SQL exclusion proof. That proof currently rejects any legacy mapping regardless of status or environment. Removing this check alone is unsafe.

The production checkout migration already intercepts production paid-video receipts before legacy grant/ledger processing. Its production ownership must remain unchanged. Native sandbox quotes already deliver the exact wire product ID to the normal client; client SKU replacement is unnecessary.

## Smallest coherent proposed change

Implement a forward-only, default-off ownership extension, not modifications to installed migrations or pinned native bundles:

1. Append-only ownership qualification keyed by exact RevenueCat project, app, store, SANDBOX environment and product; only the four reviewed Apple IDs are eligible. Bind the exact retained catalog/mapping identities and native catalog revision. Empty installation creates no handover or dispatch authority.
2. Before accepting a handover, lock and examine all matching legacy intents, checkout claims, provider events, consumable/premium transaction authority, unbound initial/terminal reservations, reconciliation obligations, access grants and money-ledger provenance, plus native pending receipts, claims, allocations and tombstones. No-intent overlap alone is insufficient. Any prior or ambiguous authority blocks qualification; do not delete or reinterpret history.
3. Fence legacy sandbox admission and checkout at database boundaries for owned IDs, including insertion/direct RPC paths, while preserving production and every other product. A catalog status toggle is not the fence.
4. Within existing legacy atomic dispatch, handle an exact owned sandbox receipt as durable evidence/reservation only, before normal mapping adoption or any legacy positive grant/ledger effect. Use an explicit handover disposition, never fabricate `product_mapping_missing`. The existing generic ignored branch can retain an intent/product link and omit an unbound reservation when a consumable link exists, so merely forcing its ignore reason is insufficient. Preserve original-transaction conflict checks, unknown holds and terminal cleanup. Existing historical owners must never be stolen. Legacy originals are keyed by provider/original transaction, broader than native scope; cross-app or cross-environment collisions stay held.
5. Extend the exclusion proof with a narrowly bound ownership alternative for the catalog-overlap and cross-environment intent-inventory clauses. Existing exclusion rejects any intent using the SKU across all environments; leaving that blanket check would let a future legitimate production purchase block sandbox reconciliation. Preserve actual transaction/original conflicts across environments, subject, ingress/hash and durable no-legacy-effect requirements. Align the internal webhook outcome validation with this explicit disposition; never trust a caller/provider `nativeExclusion` flag.
6. Require the same ownership qualification at native quote/reservation/dispatch and reconciliation boundaries so a configuration change cannot create dual ownership. Preserve native uniqueness on scoped transaction/original transaction and selection/reservation/attempt/claim/receipt. No second credit path.

## Rollout and rollback

Deployment remains off. Qualification, matching native catalog configuration, shared routing and provider/device verification are separate actions. Disabling new admission must not return these SKUs to the legacy path or discard pending native receipts. Append-only retirement stops new dispatch while retaining reconciliation/terminal ownership. Reassignment would require a new independently reviewed history-free transition, not deletion or a boolean flip.

## Expected source impact

- New forward migration for ownership, admission fences and exact receipt/exclusion integration; preserve production interception.
- `supabase/functions/revenuecat-webhook/index.ts` only if the new explicit no-legacy-effect disposition needs a distinct validated result shape.
- Native sandbox forward extension for quote/reservation/dispatch/reconcile ownership checks; do not rewrite installed `isolated-runtime` module bytes.
- Focused database and shared-handler tests covering simultaneous handover/legacy admission, replay/terminal-first, old history, scope collisions, disabled/retired ownership, production and unrelated products.

The native 48-module and shared extensions are separately installed, not assumed present in the ordinary migration chain. Prefer a separately installed forward extension with exact prerequisite identity checks and explicit rejection when missing. Its focused fixture must install the real required native/shared bases. Do not silently skip missing functions or replace immutable bundle source. This is separate follow-on work, not an incomplete exemption to fold into the currently running PR709.

## Open design gates

The exact safe atomic legacy recorder extension and full history join inventory need independent review before implementation. The public legacy recorder does not expose the same project/app scope as native intake, so the extension must establish that binding from verified ingress/configuration, not infer it from product ID. Delayed old purchases must not become native-owned simply because their webhook arrives after cutover; qualification must bind independently verified purchase/admission provenance, not receipt arrival time. Existing receipt/grant uniqueness in each subsystem alone does not establish cross-subsystem exclusivity. No implementation or activation claim is made by this proposal.

## Resolved minimal binding design

Independent review confirms the existing trusted composition can supply this binding without new credentials:

- Extend the internal `RevenueCatLegacyObserverV1` context with a frozen nonsecret connection ID/revision, project/app/store/SANDBOX scope and authenticated raw hash. Construct it only after existing authenticated-byte classification identifies an exact native route. Never deserialize this context from provider JSON or request headers.
- Pass this context to a narrowly scoped service-role ownership recorder. SQL independently checks installed `native_store_sandbox_v1.connections`, revocations, exact ownership, canonical ingress hash and event identity. This does not wait for native intake; legacy cleanup remains runnable if that concurrent path fails.
- Trust limit: the authenticated service-role callback supplies selected parsed event fields and selects the project/connection. SQL checks their registry, ownership, canonical event and ingress-hash consistency; it does not independently verify the RevenueCat secret or cryptographically derive those parsed fields from the raw hash. Raw provider bytes are not added to RPC arguments, tables, logs or responses. Actual-handler mutation tests cover provider/header attempts to fabricate internal context. A compromised service-role caller is not made untrusted by this protocol.
- The existing positive allocator already checks exact connection revision, quote, claim, reservation and qualified dispatch attempt, and requires purchase time at or after the actual attempt's creation (using existing millisecond precision). Enforce post-handover creation of native attempts. Keep this original purchase-time check; do not replace it with webhook arrival time.
- For terminal-first delivery, existing legacy-owned originals retain legacy cancellation/recovery. A previously unknown original can produce only a no-grant sandbox tombstone under exact authenticated scope and a durable unbound-original reservation. Subsequent initial delivery remains constrained by that original/tombstone. Mixed or unknown scope stays held.
- The database legacy projector must also refuse new positive adoption of an owned sandbox SKU when internal context is absent (for example, shared routing disabled). Missing routing context must not restore old ownership. Existing historical terminal cleanup still delegates to its original owner. Application configuration is not the admission fence.

This resolves the scope and delayed-receipt feasibility questions. Remaining work is implementation of the explicit forward extension and focused concurrent/history tests, not a new authentication or deployment framework. Keep it separate from PR709's existing run.

## Current implementation and proof limits

The shared composition and actual webhook now carry only the frozen selected-field context described above. The two-argument recorder call contains no raw provider body. Missing ownership delegates to the existing handler; invalid or unavailable proof holds the request rather than restoring legacy positive authority. The separately installed SQL extension must exist before this handler is enabled for these four native-routed IDs. A default-empty extension must safely return null for unowned products.

Focused actual-handler tests cover authenticated scope versus provider/header spoofing, production/mixed routing, positive and terminal early recording, missing ownership, invalid proof, and concurrent native journal failure. Current production/notification/provenance regressions and identity/entitlement/transfer fixtures also pass. These mocked recorder results are not proof that the new database transition, history inventory, role boundaries, or race handling work. Those require the real installed-base PostgreSQL fixture and independent final review before publication or installation.

Preparatory target counts are not an atomic cutover qualification. Unmatched ingress and unattributable canonical events remain unknown. The implementation must hold any unclassifiable history, retain existing recovery authority, and never infer that webhook arrival after a handover establishes a new purchase. No ownership row, provider change, build or activation is performed by this source work.

## Resumed source review, November 12

The owner approved implementation and testing of this source handover. The
standalone ownership fragment remains deliberately non-installable; the complete
transaction includes the recorder through the source composition described above.

Review found that the draft admission fences acquired a global handover lock
for unrelated purchases, even with no ownership rows. The source now limits
that lock to the four candidate Apple sandbox products. The legacy fence also
explicitly excludes Google purchases whose product row shares an Apple mapping;
the native fence excludes production and non-Apple scopes. Candidate Apple
sandbox products still acquire the lock before the owner lookup, protecting
the race with qualification before an owner row exists.

`native-apple-ownership-scope.test.mjs` executes these actual SQL fence bodies
against narrow synthetic tables and a deliberate lock sentinel. It verifies
scope isolation only, not complete installed-base or concurrent cutover proof.
The 27 existing shared-routing tests also passed after these changes.

The durable recorder, no-context positive-effect fence, retained catalog identity,
exact native binding/revision verification and installer privilege preconditions
are now implemented. Real PostgreSQL tests cover their composition. Existing
mock recorder tests remain narrower evidence rather than substitutes for SQL
verification. Deployment is not included in this source change.

The four-ID limit is the reviewed handover scope, not a decision to restrict
future creator pricing to four prices. Reassigning ownership does not itself
change the fixed-price catalog or implement arbitrary creator-set amounts.
