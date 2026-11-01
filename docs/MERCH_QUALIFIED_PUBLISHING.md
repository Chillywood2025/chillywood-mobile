# Explicit merchandise live publishing

No deployment seeds accounts, tax policy, provider evidence, product activation, or money switches.

1. Creator saves a Test draft and reviews actual price, stock, variants, shipping tracking and any attached scanned/approved photo.
2. **Review live publishing** requires the current exact authenticated session and current creator legal/money authority. Server selects production mode, exact live Connect account, and the matching platform-account product tax policy. Current platform legal/fulfillment/provider qualification and live controls remain required.
3. Server issues an immutable ten-minute review. Product revisions are monotonic (including A→B→A changes); qualification/account/control mutations advance a nontransactional monotonic epoch. Review never silently publishes.
4. Creator explicitly confirms real purchases. The transaction locks existing retained-media/product paths before qualification tables, rechecks current eligibility/expiry/source revision, preserves existing photo/variant publication checks, and records an immutable receipt. Old live listings cannot be republished from paused/draft by the old save RPC without review. A receipt retry acknowledges the original action without republishing a subsequently paused listing.
5. New reviewed live listings recheck current Connect/tax eligibility at reservation. Original order quotes/terms remain immutable.

Products with any test checkout history cannot change environment. **Create separate live-ready draft copy** creates new inventory and variant IDs with independently reviewed available stock. It copies no photo reference or tax/provider authority. It never archives or changes the original listing and never changes accepted orders. Creator adds/reviews the new draft photo and completes applicable category/product verification.

Ordinary buyer discovery excludes Test listings. Creator and approved tester previews retain explicit Test labels. Live listing display is not a promise that checkout is currently enabled.

## Validation and rollout

- Full-schema tests exercise first publication, source/qualification ABA, canonical receipt retry, unknown eligibility, exact source copies and buyer visibility.
- Mounted UI tests execute review, explicit consent, dirty-form denial and separate draft-copy behavior.
- Existing guarded native runner includes three additional real blocking-edge schedules for concurrent source edit/review and ABA/confirmation, and creator eligibility revocation/confirmation. Locally running their SQL sequentially only validates fixtures; hosted native CI is required for concurrency evidence.
- pgTAP checks exposed RPC grants and private review/context isolation.
- Before any future authorized live use, independently verify exact platform account, creator live account, active legal/fulfillment/tax facts and switches. No manual SQL product promotion is needed.
- Stop new sales with existing merch/live controls or pause the listing. Do not roll back accepted orders or change their immutable mode, price or return terms. Roll back UI to read-only/pause behavior; keep receipt/history migrations intact.

## Creator category review UI

Manage Shop exposes only server-returned approved categories, with explicit **Use category** actions. Creators cannot enter tax codes, liability mode, collection behavior or provider verification flags. An unlisted category requires a description and creates an owner-review request; it never guesses a classification or publishes. The owner queue suggests an approved category, while the creator must explicitly select it. Current provider/account/jurisdiction qualification remains independent.

Category selection uses exact saved product revision and account/session authority. Its returned revision replaces the editor's revision and invalidates any pending live-publication review. Stale reads and callbacks after source/account replacement cannot apply. UI deployment requires the matching category-template RPC migration; unavailable RPCs show a retry message, not a fabricated ready state.

Draft-copy retries are keyed by the original product's monotonic revision. A lost response resumes the same copied product/inventory identity instead of allocating a second copy; editing the original creates a new revision eligible for a separately reviewed copy. The original is never silently archived.

Current Wave1 creator eligibility and legal requirements are rechecked under the existing creator advisory order plus shared qualification locks; exact creator session deletion also serializes with confirmation. Revocation and restoration advance the publication authority epoch, requiring a new creator review rather than silently reusing the old one.
