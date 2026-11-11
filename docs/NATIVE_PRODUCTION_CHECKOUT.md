# Normal production Paid Video source contract

This successor is **source-only and OFF**. It does not activate products,
change providers, provision credentials, deploy, build, purchase or move money.
Synthetic tests are not provider interoperability or installed-device proof.

## Normal path

The ordinary Paid Video purchase owner can request an exact production
capability, run `prepare_native_production_paid_video`, create its qualified
production intent and claim one SDK dispatch. The admission remains immutable
with `dispatch_allowed=false`. A separate private dispatch records the exact
admission, production intent and checkout qualification. It does not promote
sandbox catalog rows, allocations, receipts or source evidence.

The original ordinary precharge, source/subject locks, quote capture and
`begin_creator_money_checkout` remain authoritative. They retain buyer/session,
legal acceptance, creator eligibility, audience, actual catalog/store price,
source safety and durable unresolved-purchase protections. Production launch
also requires a current immutable byte proof and independently qualified
delivery/SDK configuration. A flag or a nonempty SDK key alone is insufficient.

The native client must verify the exact configuration/quote and current shared
purchase-owner session/lifecycle immediately before the synchronous SDK call.
An unknown or repeated dispatch must never launch another purchase. Client
transaction callbacks remain hints, not trusted receipt correlation.

## Independent access versus economics

Normal production Paid Video events are recorded canonically before the old
product/price intent matcher. Other products and existing shared historical
transaction owners keep their original consumers. Normal post-canonical ingress
retains exact provider/project/app/product/buyer/transaction facts and queues
the ledger's report obligations. Terminal evidence stays independently recorded.

An independently qualified receipt adapter sends a bounded signed assertion to
the default-OFF receipt-verifier endpoint. The database authenticates its exact
private verification key and qualification and derives correlation only from
the immutable dispatch plus authenticated proof. The adapter must authenticate
the production Store/account/transaction, actual paid amount/quantity, purchase
time and its SDK-dispatch correlation. Merely signing unverified client or
webhook input would violate this contract.

The narrow issuer rechecks canonical observation, exact buyer/account/product,
one-shot checkout, admission window, original source/terms and ledger correlation
uniqueness. Valid independently qualified access can be created while actual
fees/taxes/proceeds/report coverage remain unknown and creator economics stay
HELD. No money ledger or payable creator entry is manufactured by checkout.

The ordinary content resolver rechecks current source, checkout/delivery/access
qualification, account/audience, quarantine and negative/mixed lifecycle state.
Historical ownership remains retained when delivery is held; source replacement,
deletion or qualification expiry does not become an invitation to recharge.
Stopping new live sales does not itself erase independently verified paid access.
Separate access OFF remains available. Valid channel subscription access remains
an independent normal authority.

## Trust and permission boundary

All new private tables have RLS and FORCE RLS, with no table access for API roles.
Qualification/key/receipt/grant bindings are immutable. Only controls are mutable,
with no public issuer or configuration mutation RPC. The signed receipt endpoint
requires exact service authorization, an explicit environment opt-in and a valid
independent adapter signature. Source never includes a real verification key.
The existing webhook cannot synthesize this signature. Namespace fences include
new qualification inserts, revocations, source revisions and control changes.

## Completion boundaries

The normal Paid Video client now routes active production offers through the
production preparation, immutable HEAD preflight, intent, normal one-shot claim,
native witness and receipt verifier. The existing RevenueCat identity queue and
per-product mutation owner contain the final synchronous launch restriction.
Neither platform reconfigures RevenueCat or changes its completion mode. Unknown
capability, build absence, delivery failure or qualification OFF never falls
through to another purchase API. Existing sandbox checkout remains separate.

The release-native module pins the existing Apple 5.96.1 / Android 10.28.1 SDKs.
Android adds official Play Integrity 1.6.0 in source only. An empty native build
configuration is OFF. Its callback journal is atomic, iOS complete-file-protected
and excluded from backup, or Android Keystore AES-GCM encrypted in noBackupFilesDir.
Only an internally captured purchase callback can produce a completion witness.
No arbitrary JavaScript signing bridge exists. Tokens/assertions are not logged.

The source issuer checks production App Attest enrollment and monotonic assertion
counters, or official Play Integrity decode verdicts with request hash, exact
package/certificate/version and device/license checks. Apple transaction truth
uses the pinned official app-store-server-library 3.1.0 signed-data verifier;
Google truth combines official productsv2 and Orders reads. Actual USD amounts,
quantity, buyer identity, transaction and original chain must agree. No storefront
price or webhook percentage can replace missing Store data. Private immutable
witness records and the qualified signed transport are both required for binding.

Normal player delivery uses the session-bound range endpoint with conditional
origin reads, per-chunk authority rechecks and a pre-play range probe. Explicit
nativeProductionDeliveryOnly grants are rejected by the legacy URL validator;
ordinary existing grants are unchanged. No new screen or custom layout was added.

**Still unresolved:** an exact callback that was never captured after process
death/pending/Ask-to-Buy cannot be guessed from product, price or a generic later
transaction update. The original dispatch remains pending and cannot charge
again. Captured callbacks can retry attestation and verification without another
Store call. The separate late-settlement migration consumes a server-confirmed
native preparation and a same-process, native-only monotonic interval captured
around SDK entry. Native prepare obtains the acknowledgment directly over HTTPS,
with redirects disabled; it cannot accept a JavaScript-fabricated grant. The
whole conservative launch interval must fit the original admission. Actual
Store settlement identity/time is independently verified, and source/scope
proofs must cover launch, purchase and current delivery. The late adapter has its
own empty-by-default qualification. Device wall time never authorizes that path.
Its narrow forward predicate had a read-only ledger interface review. The
pre-correction e15efa1 full-schema/checkout Run3 passed. Focused PostgreSQL17
Run6 also passed on exact source `0e90a3a` (21.69 seconds), including the expanded
recovery/pricing, late, renewal and session assertions. All 61 selected light and
mounted tests passed on that same source. This is a standalone checkout-base
proof, not the still-required combined exact-source ledger integration proof.
Native compile, dependency resolution, physical device behavior,
attestation/provider interoperability and full normal client recovery tests are
not yet proven. This source is not production-ready or permission to enable it.

### Opt-in pinned cryptographic regression

`tests/creator-money/native-production-apple-crypto.test.mjs` loads the exact
production pins from `NATIVE_PRODUCTION_CRYPTO_MODULE_ROOT` (a disposable
`node_modules` directory). Without that explicit directory the suite is skipped,
not cryptographic proof. Install `node-app-attest@1.0.1`, `cbor@10.0.11` and
`@apple/app-store-server-library@3.1.0` from the official registry using
`--ignore-scripts`. No app dependency or lockfile change is needed for this test.

The test uses ephemeral local EC keys and certificates, removes its certificate
directory on completion, and calls the real assertion adapter/library. It checks
signature, exact witness/app/key binding and replay counters. The real Apple
library verifies a synthetic-root Store JWS offline, followed by actual Store
fact normalization; tampering, wrong environment/app/buyer and untrusted roots
fail. Production online verification rejects that synthetic chain without an
OCSP URI, and enrollment rejects its non-Apple attestation chain. No real provider
request or positive mocked attestation is used. Passing this test does **not**
prove production Apple enrollment, OCSP, API authentication, device signing,
Google token decoding or Deno interoperability. The pinned assertion library
reads a signed 32-bit counter: values above 2147483647 fail closed; qualification
must not promise the full unsigned counter range without a reviewed remedy.

Paid playback uses current compatible delivery authority separately from its
immutable purchase qualification. A reviewed renewal explicitly linked to the
original delivery root can support a new app/SDK build or expired historical
qualification. Unlinked, changed, revoked or tied current qualifications hold
access without inviting another charge. Playback authenticates the buyer's
current session, so the original purchase session need not remain alive. The
renewal/session regression assertions passed on the pre-correction head e15efa1.

## Review correction contract

An unclaimed dispatch may be retired only under the shared database authority
fence while both checkout start and attempt are absent. Old rows remain immutable.
The retained ordinary precharge pending-intent predicate excludes only those
exact authoritatively retired native dispatches, so retirement and new preparation
can commit together without altering unrelated pending purchases.
An already claimed dispatch, including a lost claim response, is never retired.
Every native entry now obtains a direct authenticated server check of the exact
claimed dispatch and preparation. The shared purchase owner rechecks account,
session and synchronous lifecycle/quote restriction after that await; native
entry consumes its memory-only handle once and performs no further pre-SDK await.
Thus a handle retained before authoritative retirement cannot charge afterward.
Authorization of a claimed handle is retryable only in the same live process.
Native per-handle prepared/authorizing/ready/checking/invoked states and unique attempt
epochs reject simultaneous requests and delayed responses; invocation consumes
the handle immediately before entering the SDK, before any callback can fail.
The synchronous checking stack may return the same handle to ready after a final
context or journal-I/O failure, but only while its epoch is still current and
the SDK was never entered. Its in-memory journal-attempt marker permits rewriting
only that handle's interrupted pre-entry journal. The marker is not persisted or
reconstructed; callbacks and SDK exceptions cannot restore an invoked handle.
The shared owner can retry a failed
authorization, and an explicit later buy attempt may resume that same retained
handle after a fresh delivery preflight. It never creates another claim or Store
call for an invoked handle. Invalidation/restart does not rebuild launch handles.
Claimed work whose process state was lost before SDK entry therefore remains an
explicit unresolved no-invocation recovery gap, alongside uncaptured callbacks
and pending app-upgrade recovery. Missing journals do not prove no charge.

Verified Store facts are durably retained in a signed, token-free private envelope
before canonical ingress is available. Either arrival order can reconcile the
same immutable dispatch. The webhook and Purchases refresh/restore both retry
without a purchase call; interrupted submission can replay the protected native
journal. Raw tokens/assertions never enter the durable server queue. Paid access
still requires exact transaction/canonical identity and all current delivery and
negative-lifecycle checks. Refresh paginates exact unresolved dispatches in batches
of ten; the buy flow can also recover its exact original dispatch.

Google Orders listing price, actual buyer-paid total, paid tax and tax-inclusion
semantics are separate authenticated facts. The quote stays unchanged. A derived
listing-to-paid adjustment and any reported points coupon are diagnostic, not
invented fees, funded subsidy or developer proceeds. Valid zero-cash discounted
purchases can establish access only with the exact signed pricing proof. RevenueCat
product-price observations are not substituted for actual Store paid totals.
Ledger baseline tax must match the authenticated purchase tax, while separately
signed later corrections retain their own tax authority. The current economic
equation is buyer-paid cash only; provider-funded proceeds exceeding that basis
remain HELD until a separate authenticated funding/allocation contract exists.
Missing components never become fabricated zeros.

Both privileged Edge adapters verify JWT claims and Auth user identity, require
the session header to equal the verified session claim, and retain database
live-session checks. Decoded-but-unverified JWT payloads never authorize a call.

This is an implementation draft until the focused full-schema PostgreSQL suite,
ordinary client tests, shared webhook regressions and exact-head Required
Validation pass. The parent combines this compatible source with the ledger
successor before publication. No standalone publication is authorized here.

External requirements remain real immutable-origin/scan proof, actual production
delivery-adapter and installed app/SDK qualification, authenticated provider
receipt/correlation issuer qualification, actual financial report/funding proofs,
and physical playback evidence. No real qualification or signature key is seeded.
Hosting, deployment and provider/security changes remain separately held.

The draft does not claim that a private qualification label installs a playback
adapter or that a generic signed assertion proves Store interoperability. Those
must be evidenced against the actual application and serving environment before
any checkout control can be enabled.
