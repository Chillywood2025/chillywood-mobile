# Cognitive P1 remediation report

Status: `security_hardening_in_progress`

Implementation base: `bd8fd0c709db8ff843b69fa9b9a5039a74d09a94`

Independent review: PR #15 at `ff6b2588e2dcc4fa8e76c8f8f6dac47f64cb0667`

The branch is an undeployed, off, uncredentialed scaffold. Local remediation
addressed the original review inventory, and each exact-head retest was allowed
to reopen rows when it found a new composed-boundary bypass. The eleventh retest
findings are corrected locally but remain open until a fresh exact-head
independent retest verifies them.
The executable attack suite reports 40/40, the cognitive database suite reports
203/203, the full repository database suite reports 488/488, the independent
source variants report 83/83, the runtime-authority variants report 11/11, and the separate
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

The sixth exact-head retest of
`09845ff5d757673c9174ecab2481823824ba93d0` confirmed that every original
PR #15 P1 remained closed, then found two new SQL persistence P1s: a
triple-nested base64url credential bypass and unsanitized finding type/target
fields. The corrective migration closes both, gives current findings bounded
retention and controlled erasure, and keeps research ingestion unavailable
until a service-owned broker receipt authority exists. The same corrective set
binds architecture evidence to immutable commit blobs, rejects caller-fabricated
research support, broadens provider escalation classification, aligns security
identifiers, and restores truthful in-progress copy. Local source and database
regressions pass; exact-head independent retest remains required.

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
  verification, exact-head bypass closure, and 78 cumulative independent variants.

The read-only dependency audit remains at the inherited baseline: 23 advisories
(3 high, 19 moderate, 1 low, 0 critical), with no package-lock or dependency
change introduced by hardening. No audit fix ran. The existing owner/counsel
retention decision and three human review lanes remain deployment gates.
The inherited advisories remain an explicit source-side deployment blocker
pending separately reviewed dependency upgrades; this remediation did not hide,
downgrade, or automatically rewrite them.
No new direct, transitive, native, postinstall, or license obligation was added;
the hardening runtime uses Node built-ins and the already locked TypeScript
package. All 35 workflow action references are pinned to immutable commit SHAs
with reviewed version comments. The CI guard rejects future mutable action tags.

Independent automated retest status: prior exact-head passes correctly found
remaining P1s; the fresh retest of the next corrective commit is pending on the
separate review-only branch.

The seventh exact-head review of
`ac488bd5302671326ffbe1873f7eb67680e8a6d0` independently reproduced
additional encoded-boundary defects in TypeScript, PostgreSQL, and the exact
research transport. It also found that operational identifiers did not all use
the recursive secret classifier. The corrective working tree now covers
six-layer fail-closed decoding, folded base64 and hexadecimal SQL input,
encoded identifiers, pre-DNS credential rejection, computed tool truncation,
privileged provider wording, and hostile Git environment isolation. Authored
evidence is 66/66 hardening variants, 40/40 canonical red-team attacks,
11/11 runtime-authority regressions, 462/462 local pgTAP assertions, and a
passing two-session finding race. These are implementation results only; a
fresh exact-head independent retest remains required before the final
hardening label can be used.

The eighth exact-head review of
`565096d76d212511f0e38afcd54a27451e2d3605` again correctly prevented a
premature close. Independent probes found short encoded credentials,
separator aliases, candidate-frontier saturation, arbitrary whitespace-folded
base64, encoded/split private identifiers, and a SQL percent/base64 branch-loss
case. It also required externally binding architecture evidence to the reviewed
commit and decoding provider escalation telemetry. The next corrective
checkpoint includes those exact vectors. Authored evidence is now 70/70
hardening variants, 40/40 canonical attacks, 11/11 runtime-authority tests,
473/473 local pgTAP assertions, and passing finding concurrency. The final
status remains in progress until a new exact-head independent retest returns
zero P0/P1.

The ninth exact-head review of
`feef1e79c2962c5523d6b59c8d441e99ffbe90de` found no P0 and confirmed the
architecture provenance and candidate-saturation controls. It independently
reproduced short base64url/hex credential aliases, compound/fullwidth query
labels, caller-truncatable URL inspection, outbound encoded private identifiers,
compressed IPv6 identifier persistence, a safe typed-UUID JSON false positive,
and additional provider privilege wording. The corrective checkpoint now uses
one NFKC-normalized sensitive-label grammar, a pre-parse URL byte cap, short
bounded decoding, query-only private-data egress checks, compressed IPv6
classification, recursive typed JSON validation, and bounded nested provider
text aggregation. Authored evidence is 75/75 independent variants, 40/40
canonical attacks, 11/11 runtime-authority tests, 476/476 local pgTAP
assertions, and a passing two-session finding race. These findings remain
independently open until the next exact-head retest.

The tenth exact-head review of
`f96ddeed509205c4b2f8530dd2c7bb196093d490` found no P0 but correctly
reopened compound credential-label, Unicode/private-identifier, recursive
hexadecimal branch, provider-privilege wording, and false-positive boundary
cases across TypeScript, the exact research transport, and PostgreSQL. The
corrective checkpoint now detects suffix labels such as `token[session]`,
NFKC-normalized labels, internationalized email identifiers, recursively
hex-encoded credential assignments, reordered split JSON values, and explicit
provider wildcard/admin language before DNS or persistence. Safe UUIDs,
bounded opaque hexadecimal identifiers, namespace notation, and a 2,048-byte
research URL remain accepted. Authored evidence is 78/78 independent variants,
40/40 canonical attacks, 11/11 runtime-authority tests, 196/196 cognitive
pgTAP assertions, 481/481 repository pgTAP assertions, and a passing concurrent
finding lifecycle test. These results remain implementation evidence only
until the next exact-head isolated review returns zero P0/P1.

The eleventh exact-head review of
`42b2dd62df225f088693dc3b7435ecf933adaff4` again found zero P0 and
correctly stopped closure. It reproduced default-ignorable and confusable
credential labels, IDNA-equivalent email separators, Unicode phone/private-IP
forms, three-/four-fragment JSON reconstruction, PostgreSQL Stripe/JWT boundary
errors, prefixed credential keys, private IPv6 escaping through custom-scheme
parsing, and structured provider privilege semantics. It also measured the
all-pairs SQL sanitizer above fifteen seconds below the documented payload
limit. The corrective checkpoint now uses one detection-only security
normalizer across source/runtime/SQL, explicit token boundaries,
segment-aware keys, bounded small-envelope reconstruction, structured provider
policy checks, and a linear 128-value database path. Authored evidence is
83/83 hardening variants, 40/40 canonical attacks, 11/11 runtime-authority
tests, and 203/203 focused cognitive pgTAP assertions. A timed benign
128-value SQL envelope completed in under one second locally. These remain
implementation results only; every eleventh-review item stays independently
open until a fresh exact-head review reports zero P0/P1.

No remediation grants production execution, scheduler, deployment, release,
money, rights, auth/RLS, role, moderation, provider-product or self-approval
authority.
