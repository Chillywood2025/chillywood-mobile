# Cognitive Predeployment Closeout

Current gate: `collective_governance_source_complete_awaiting_exact_head_review`.

Implemented source controls include canonical sanitizer/network/path policies,
fail-closed retention, postflight receipts, budget reservations, hierarchical
leases, rollback authority revocation, council/quorum/veto/dissent, immutable
decision manifests, and 24-hour approval/revalidation contracts.

The first independent review of the Collective Governance candidate found no P0
but did identify P1 trust-boundary defects in quorum derivation, capability
renewal/consumption, evaluator evidence, postflight result binding, hierarchical
leases, rollback revocation, canary evidence, provider-policy interpretation,
service identity, and credential-path confinement. Those findings are corrected
in source and have authored regression coverage. They remain open until a fresh
four-lane review evaluates the exact corrective head.

The credential-path correction includes the independently reproduced
`config/npm-token.txt`, `config/npm_token.txt`, `config/.npm-token`,
`config/yarn-token.txt`, and `config/github-token.txt` family in both the
machine-readable policy and the actual executor boundary.

The final corrective database boundary also closes the exact-role/participant
quorum gap, minority finalization, placeholder decision hashes, broker-authored
postflight state, unrelated lease substitution, arbitrary physical/provider
evidence IDs, caller-selected evaluator status, caller-nominated Owner identity,
non-atomic schedule enablement, and unverified credential readback. Superseded
self-pass RPCs remain in migration history only and have no runtime grant.

Deployment remains prohibited until the exact corrective head has zero P0/P1
findings, all 40 canonical and all governance attacks pass, CI and the local
database suite are green, dependency blockers are closed, migration and functions
are reviewed, emergency stop is verified, and rollback is documented.

Current authored evidence:

- canonical attacks: 40/40;
- inherited hardening regressions: 104/104;
- runtime-authority regressions: 11/11;
- governance source tests: 38/38;
- governance adversarial tests: 33/33;
- governance Edge boundary tests: 8/8;
- complete local database suite before exact-head freeze: 645/645;
- dependency guard: zero critical/high production-reachable advisories, with 23
  existing moderate advisories documented.

The authored source and fixed regression gates are complete. This label grants no
deployment authority: no cognitive migration, function, credential, scheduler,
canary, or production authority is activated by this source checkpoint. The next
gate is the frozen-head four-lane independent review.
