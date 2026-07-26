# Governance Constitution

Status: `collective_governance_source_complete_not_deployed`; not deployed and not active.

The canonical machine-readable constitution is
`config/intelligence/governance-constitution.json`. It preserves owner authority,
forbids self-approval, and keeps merge, release, money, user rights, auth/RLS,
roles, moderation enforcement, legal declarations, and provider-product mutation
outside cognitive authority.

Council roles are advisory. They receive the same immutable evidence packet and no
provider credential. Security/privacy, reliability/release,
product/user-experience, and adversarial-red-team criticism is mandatory.
Majorities cannot override an unresolved mandatory veto for security, privacy,
auth/RLS, money, rights, public release, legal, or retention scope. Model consensus
is never owner approval.

A constitution amendment requires a proposed diff, independent security review,
adversarial regression, exact owner approval, an immutable version record, a
24-hour activation delay, and a rollback plan. Cognitive services cannot amend the
constitution or grant themselves authority.

Activation is represented by immutable `owner_approved` and `activated` events;
the version row is never rewritten. The first independently reviewed canary
constitution has a one-minute provider-safe activation delay after exact Owner
approval. Every later amendment retains the 24-hour delay. A service can activate
only the exact scheduled version after the database-authoritative boundary.

The global emergency stop and component kill switches fail closed. Restoring a
component requires fresh owner-authorized preflight; a prior capability or approval
cannot be reused.
