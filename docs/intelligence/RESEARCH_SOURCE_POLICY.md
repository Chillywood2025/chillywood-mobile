# Research Source Policy

Status: `LEVEL01_SOURCE_READY_PENDING_EXACT_REVIEW_AND_DEPLOYMENT`

Primary sources first for technical facts, security advisories, platform behavior, and store policy. Consequential news requires corroboration. Product, UX, competitor, and engineering research must remain clearly labeled by source type.

Every claim records a source reference, publisher, machine-observed publication
date, retrieval date, source type, claim, confidence, freshness deadline,
contradiction state, and citation metadata. The broker rejects a source when its
requested publication date cannot be verified in retrieved body metadata or the
HTTP `Last-Modified` header. Expired claims require refresh.

All web content is untrusted. It cannot invoke tools, expand scope, override policy, or supply credentials. Prompt injection is detected and blocks the claim. Secret-like content and private user data are rejected/redacted. Raw research instructions never become execution plans.

CI uses local mocked sources and no production web credential. The broker stores
hashes, bounded excerpts, relational claim/source links, retrieval events and
contradictions in the service-owned memory contract. It does not archive full
articles. Public-research source and claim text expires after at most 30 days.
A bounded processor replaces expired text with one-way tombstones and records
immutable retention and central erasure events; safe hashes and relational audit
history remain.

The transport contract is HTTPS-only, resolves and validates every address, rejects private/reserved/metadata targets, revalidates redirects, sends no cookies or authorization, and enforces timeout, type, compressed/decompressed size and decompression-ratio limits. Source text always remains untrusted evidence and never confers execution authority.

Authority is derived from a reviewed hostname/publisher/source-type registry, not
from a caller boolean. Consequential news requires distinct registered owners,
canonical URL hashes, and content hashes. The transport must report the connected
peer and it must match one of the public DNS-pinned addresses. Missing, private,
or mismatched peer identity fails closed.

The broker owns the pinned HTTPS transport boundary. It derives the bounded
excerpt, content hash, canonical locator, citation title where page metadata is
available, publication-date verification, DNS-address hashes, and retrieval
receipt. Caller citation title/locator values do not become stored authority.

Claims must have bounded extractive support: after conservative Unicode and
whitespace normalization, the complete claim must occur in every cited bounded
excerpt. Technical, platform-policy, and security claims require an official
primary source. Consequential current news requires extractive support from at
least two distinct registered owners, canonical URL hashes, and content hashes.
The broker computes the claim hash and reads it back after persistence.

The independent research evaluator invokes a closed database derivation. The
database recomputes claim/source hashes, extractive support, publication and
retention bounds, retrieval receipts, freshness, primary-source rules,
corroboration, and contradiction state. The evaluator response reports the
persisted evidence-manifest hash and persisted reasons; a JavaScript-only hash is
never presented as the governance proof.

Activation still requires exact-source review, local pgTAP/concurrency and Deno
tests, deployment of the forward migration and both Edge Functions, distinct
broker/evaluator invocation and service credentials, and the existing
Owner → worker → evaluator switch chain. User-derived memory remains disabled.
