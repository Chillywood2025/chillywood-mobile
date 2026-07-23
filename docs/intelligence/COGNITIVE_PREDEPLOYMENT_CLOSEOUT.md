# Cognitive Predeployment Closeout

Current gate: `collective_governance_source_complete_not_deployed`.

Implemented source controls include canonical sanitizer/network/path policies,
fail-closed retention, postflight receipts, budget reservations, hierarchical
leases, rollback authority revocation, council/quorum/veto/dissent, immutable
decision manifests, and 24-hour approval/revalidation contracts.

Deployment remains prohibited until the exact final head has zero P0/P1 findings,
all canonical and governance attacks pass, CI and local database suites are green,
dependency blockers are closed, migration and functions are reviewed, emergency
stop is verified, and rollback is documented.

This document must be updated with the exact frozen commit, review PR, test counts,
remote migration/function versions, and canary decision.
