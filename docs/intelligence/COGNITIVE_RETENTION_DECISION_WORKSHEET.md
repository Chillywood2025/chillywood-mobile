# Cognitive Retention Decision Worksheet

Policy state: `owner_counsel_decision_required`.

| Data class | Personal | Purpose | Initial retention | Access | Erasure / hold |
|---|---:|---|---:|---|---|
| Public research | No | cited current evidence | 30 days | service, owner readback | expire; no hold |
| Repository source metadata | No | architecture/UX analysis | 30 days | service, owner readback | expire; no hold |
| Non-personal operational metadata | No | bounded canary health | 90 days | service, owner readback | expire |
| Sanitized hashes | No | audit linkage | 365 days | service, owner readback | retain non-personal audit |
| Bounded sanitized evidence | No | proof and evaluation | 90 days | service, owner readback | redact/tombstone; reviewed hold |
| User-derived memory | Yes | undecided | disabled | none | disabled pending decision |
| Raw user reports/chats/media/analytics | Yes | not authorized | disabled | none | never ingest |

Product-experience sentinel runs and product-quality findings are stored only as
synthetic/sanitized operational metadata with `retention_until`, `data_class`,
`legal_hold`, and retention indexes. They cannot contain raw private user data or
user-derived memory while the Level 0/1 private-data switches remain off.

Before user-derived memory can activate, owner and counsel must decide lawful
purpose, retention, access roles, backup deletion, provider processing, legal hold,
redaction, erasure, and post-erasure audit fields. Until then database and function
gates reject that data class and private user data is not sent to a model.
