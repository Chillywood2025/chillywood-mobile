# Research Source Policy

Status: `SECURITY_HARDENED_SCAFFOLD_NOT_DEPLOYED`

Primary sources first for technical facts, security advisories, platform behavior, and store policy. Consequential news requires corroboration. Product, UX, competitor, and engineering research must remain clearly labeled by source type.

Every claim records a source reference, publisher, publication date when known, retrieval date, source type, claim, confidence, freshness deadline, contradiction state, and citation metadata. Expired claims require refresh.

All web content is untrusted. It cannot invoke tools, expand scope, override policy, or supply credentials. Prompt injection is detected and blocks the claim. Secret-like content and private user data are rejected/redacted. Raw research instructions never become execution plans.

CI uses local mocked sources and no production web credential. The broker stores hashes, bounded excerpts, relational claim/source links, retrieval events and contradictions in the undeployed service-owned memory contract. It does not archive full articles.

The transport contract is HTTPS-only, resolves and validates every address, rejects private/reserved/metadata targets, revalidates redirects, sends no cookies or authorization, and enforces timeout, type, compressed/decompressed size and decompression-ratio limits. Source text always remains untrusted evidence and never confers execution authority.

Authority is derived from a reviewed hostname/publisher/source-type registry, not
from a caller boolean. Consequential news requires distinct registered owners,
canonical URL hashes, and content hashes. The transport must report the connected
peer and it must match one of the public DNS-pinned addresses. Missing, private,
or mismatched peer identity fails closed.
