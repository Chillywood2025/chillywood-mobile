# Cognitive P1 remediation report

Status: `security_hardened_scaffold_not_deployed`

Implementation base: `bd8fd0c709db8ff843b69fa9b9a5039a74d09a94`

Independent review: PR #15 at `ff6b2588e2dcc4fa8e76c8f8f6dac47f64cb0667`

The branch is an undeployed, off, uncredentialed scaffold. Local remediation
closed 25/25 P1 findings, 23/23 technical P2 gaps, and 4/4 P3 findings.
The executable attack suite reports 40/40, the cognitive database suite reports
125/125, the full repository database suite reports 410/410, and the separate
two-session recurrence race reports one current row, two occurrences, and two
immutable lifecycle events.

The first automated independent retest did not pass. It correctly found remaining
P1 enforcement gaps in composed action execution, capability proof/fail-closed
issuance, evaluator evidence authority, database state/approval isolation,
rollback mutation, recursive secret detection, tool-result trust, and the research
transport. Commit `44aa2aa0` is the corrective source checkpoint for those
findings. It adds 14 independent-variant regressions in addition to the original
40 attack IDs. A fresh four-lane retest of this exact checkpoint remains required
before this report can claim independent closeout.

Implementation commits:

- `0b987819` — closed executor, capabilities, sanitizer, research, evaluator,
  budget, cancellation, lease and rollback contracts;
- `8c7b3bbd` — task-isolated state machines, immutable snapshots, provenance,
  retention, findings and executable attack/database tests;
- `b19ee9ed` — content-bound compact graph, Admin truth/access and immutable CI
  action pins.
- `a869e69f` — exact scoped-Admin permission vocabulary and final capability
  mutability/type correction.
- `44aa2aa0` — composed enforcement, opaque capability proof, immutable approval
  binding, evaluator evidence authority, real rollback quarantine, recursive
  encoded-secret rejection, IPv6/timeout research controls, and corrective
  independent-variant tests.

The read-only dependency audit remains at the inherited baseline: 23 advisories
(3 high, 19 moderate, 1 low, 0 critical), with no package-lock or dependency
change introduced by hardening. No audit fix ran. The existing owner/counsel
retention decision and three human review lanes remain deployment gates.
No new direct, transitive, native, postinstall, or license obligation was added;
the hardening runtime uses Node built-ins and the already locked TypeScript
package. All 35 workflow action references are pinned to immutable commit SHAs
with reviewed version comments. The CI guard rejects future mutable action tags.

Independent automated retest status: first pass failed; corrective fresh pass
pending on the separate review-only branch.

No remediation grants production execution, scheduler, deployment, release,
money, rights, auth/RLS, role, moderation, provider-product or self-approval
authority.
