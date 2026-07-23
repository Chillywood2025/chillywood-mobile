# Cognitive P1 remediation report

Status: `security_hardening_in_progress`

Implementation base: `bd8fd0c709db8ff843b69fa9b9a5039a74d09a94`

Independent review: PR #15 at `ff6b2588e2dcc4fa8e76c8f8f6dac47f64cb0667`

The branch is an undeployed, off, uncredentialed scaffold. Local remediation
addressed the original review inventory, and each exact-head retest was allowed
to reopen rows when it found a new composed-boundary bypass. The fourth retest
findings are corrected locally but remain open until a fresh exact-head
independent retest verifies them.
The executable attack suite reports 40/40, the cognitive database suite reports
162/162, the full repository database suite reports 447/447, the independent
source variants report 54/54, the runtime-authority variants report 11/11, and the separate
two-session recurrence race reports one current row, two occurrences, and two
immutable lifecycle events.

The completed automated independent retests did not pass. They correctly found remaining
P1 enforcement gaps in composed action execution, capability proof/fail-closed
issuance, evaluator evidence authority, database state/approval isolation,
rollback mutation, recursive secret detection, tool-result trust, and the research
transport. The current correction adds full-request capability binding,
no-follow descriptor pinning, engine-owned budget reservation, postflight
rollback/quarantine, fail-closed evidence authority, deterministic required
tests, connected-peer verification, prompt cancellation, verified source
authority, and exact service-actor/scoped-Admin database enforcement. It adds 38
independent-variant regressions in addition to the original 40 attack IDs. A
fresh four-lane retest of the next exact checkpoint remains required before this
report can claim independent closeout.

The third exact-head retest added eight P1 findings: unsafe new-file creation,
public capability internals, caller-forged budgets, base64url/split-secret
bypasses, service-role mutation of the research trust anchor, evaluator state
mutation, token-shaped evidence identifiers, and percent-encoded credential
URLs. It also added technical P2 gaps in research hash/authority binding,
key-byte limits, trusted changed-path derivation, transport identity, DNS
cancellation, user-derived task retention, source freshness, snapshot retention,
HTTP status/size enforcement, registry drift, and owner-review escalation. The
current working tree has a direct regression for each one.

The fourth exact-head retest of `b990b9e7cd020e6e4a02b9ba2b7fabb61228ba1d`
found no database P0/P1/P2, but independently reproduced forged capability
authority, non-cooperative cancellation, SQL base64url/percent secret bypasses,
credential-bearing URL fetch, caller-asserted tool hashes, credential-shaped
identifiers, arbitrary branded research mocks, citation/port behavior drift,
duplicate model keys, owner-role escalation wording, and a globally scoped
concurrency harness. The current working tree removes the injected capability
proof callback, keeps production execution structurally unavailable, limits the
only executor adapter to disposable non-Git roots, rejects and quarantines late
execution, computes evidence hashes internally, removes arbitrary mock handlers,
and adds the missing encoded-secret, identifier, citation, JSON, URL, and provider
scope regressions.

The fifth exact-head retest of
`2c8be0edd3f4aee2bd3cb9c3b3fbec24894bb8d1` again left the database isolation
lane green, but found caller-mintable isolated capability, budget, lease, fixture,
and evidence authorities; an unconstrained Git index commit; raw tool output;
late cancellation side effects; exact-fetch credential URL gaps; secret-shaped
audit identifiers; duplicate research authority IDs; prototype-backed citations;
claim/source freshness drift; and phrase-dependent provider escalation. The
scaffold returned to `security_hardening_in_progress`. The current correction
removes every caller-supplied side-effect authority while undeployed, keeps the
closed executor as a validated plan contract, and adds direct independent
regressions for every fifth-head bypass. Local source, SQL, and runtime suites
are green; a new exact-head independent retest is required before final
hardening status can be restored.

Implementation commits:

- `0b987819` — closed executor, capabilities, sanitizer, research, evaluator,
  budget, cancellation, lease and rollback contracts;
- `8c7b3bbd` — task-isolated state machines, immutable snapshots, provenance,
  retention, findings and executable attack/database tests;
- `b19ee9ed` — content-bound compact graph, Admin truth/access and immutable CI
  action pins.
- `a869e69f` — exact scoped-Admin permission vocabulary and final capability
  mutability/type correction.
- `44aa2aa0` — initial composed enforcement, opaque capability proof, immutable approval
  binding, evaluator evidence authority, real rollback quarantine, recursive
  encoded-secret rejection, IPv6/timeout research controls.
- pending corrective commit — request/capability composition, pinned filesystem
  descriptors, postflight rollback, source authority, service actor identity,
  exact scoped Admin reads, deterministic test selection, connected-peer
  verification, exact-head bypass closure, and 47 cumulative independent variants.

The read-only dependency audit remains at the inherited baseline: 23 advisories
(3 high, 19 moderate, 1 low, 0 critical), with no package-lock or dependency
change introduced by hardening. No audit fix ran. The existing owner/counsel
retention decision and three human review lanes remain deployment gates.
No new direct, transitive, native, postinstall, or license obligation was added;
the hardening runtime uses Node built-ins and the already locked TypeScript
package. All 35 workflow action references are pinned to immutable commit SHAs
with reviewed version comments. The CI guard rejects future mutable action tags.

Independent automated retest status: prior exact-head passes correctly found
remaining P1s; the fresh retest of the next corrective commit is pending on the
separate review-only branch.

No remediation grants production execution, scheduler, deployment, release,
money, rights, auth/RLS, role, moderation, provider-product or self-approval
authority.
