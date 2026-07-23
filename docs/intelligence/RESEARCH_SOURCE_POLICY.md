# Research Source Policy

Status: `SOURCE_COMPLETE_NOT_DEPLOYED`

Primary sources first for technical facts, security advisories, platform behavior, and store policy. Consequential news requires corroboration. Product, UX, competitor, and engineering research must remain clearly labeled by source type.

Every claim records a source reference, publisher, publication date when known, retrieval date, source type, claim, confidence, freshness deadline, contradiction state, and citation metadata. Expired claims require refresh.

All web content is untrusted. It cannot invoke tools, expand scope, override policy, or supply credentials. Prompt injection is detected and blocks the claim. Secret-like content and private user data are rejected/redacted. Raw research instructions never become execution plans.

CI uses local mocked sources and no production web credential. The broker stores provenance and normalized claims only in the undeployed service-owned memory contract.
