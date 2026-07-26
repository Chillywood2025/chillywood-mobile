# Product Quality Triage

Status: source implemented, not deployed.

Product quality findings are written through the service-only
`product_quality_record_finding` RPC after a sentinel run exists. Findings are
sanitized and contain hashes plus classification metadata, not raw private
evidence.

Sentinel runs and findings carry operational `data_class`, `retention_until`, and
`legal_hold` metadata. Private/user-derived data flags are forced off for Level
0/1 product monitoring.

Findings can be created only from sentinel runs that actually produced a finding
or failed. A passed sentinel run cannot be transformed into a governance finding.
Confirmed and likely defects require installed or simulator proof. Baseline
review findings must come from the visual sentinel, while provider/device
blockers require the corresponding physical-proof status.

Finding fields include:

- deterministic finding key;
- platform, route/surface, build/runtime hash;
- first/last seen and occurrence count;
- severity and user-impact hash;
- evidence hashes;
- suspected layer;
- confidence;
- reproduction state;
- affected component hash;
- provider/backend state hash;
- proposed next investigation hash;
- physical proof status;
- governance status.

Default governance status is `entered_collective_governance`. Baseline problems
can be marked `needs_product_baseline_review`.

Expired non-held sentinel and finding evidence can receive a controlled
retention tombstone through `product_experience_erase_expired_evidence`. The
underlying row is not deleted; an immutable `cognitive_erasure_events` record is
created, and table triggers reject ordinary updates/deletes.
