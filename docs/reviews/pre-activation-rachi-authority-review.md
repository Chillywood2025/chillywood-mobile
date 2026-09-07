# Pre-activation Rachi authority exact-head review

Review-only branch and draft pull request. Never merge this branch.

Implementation PR: #355  
Frozen head: `0414587f16c508f041bbd29a867c89f7a6a358e0`  
Frozen tree: `ad11ad8f14067effd656fe8f95e935acefece617`  
Base: `21352e9bf9fd24b872c850fe636942e01ee96659`

Aggregate source/security result: P0=0, P1=0, launch-impacting P2=0.
Phase 1 run `34152314732` executed at the exact frozen head. Eleven jobs
passed. Three jobs failed only at the known unbound assurance/admission
boundary. The Phase 1 run is not claimed as passed.

## Lane 1 — architecture and state

Result: P0=0, P1=0, launch-impacting P2=0.

- Rachi is an existing protected first-party pseudo-account and intentionally
  has no fabricated authentication or `user_profiles` row.
- The prior profile-backed visibility resolver therefore classified legitimate
  public Rachi content as missing, making authoritative Android refresh empty.
- The forward successor adds one exact public-visibility case for Rachi and
  delegates every ordinary identity to the unchanged hardened resolver.
- The stale iOS presentation was not treated as authoritative proof.

## Lane 2 — security and authority

Result: P0=0, P1=0, launch-impacting P2=0. Codex Security scan
`65448e43-0b76-44b6-a4b0-786d6ee94af9` covered the exact range with zero
findings.

- The exact Rachi resolver result grants only public read visibility. Admin,
  staff, self, Circle, ownership, and write-authority flags remain false.
- The viewer identity is always derived from `auth.uid()`; callers cannot
  select another viewer or escalate through an anonymous alias.
- Rachi writes remain restricted to `service_role` or an authenticated,
  existing owner/operator account. Ordinary accounts remain fail-closed.
- Internal helper execution is revoked from `anon` and `authenticated`; exposed
  wrappers retain the existing explicit grants and empty search path.

## Lane 3 — provider, native, and deployment boundary

Result: P0=0, P1=0, launch-impacting P2=0 for source and executable
integration. Installed physical replay remains a postdeployment tier.

- This successor changes one forward migration, focused pgTAP proof, and the
  release guard for the exact official-authority contract.
- It does not alter a provider catalog, native capability, app binary, OTA
  runtime, commerce switch, or release channel.
- Deployment is bounded to the exact merged forward migration. Historical
  migrations remain immutable and bulk migration push remains prohibited.
- Clean reset, 384 focused/adjacent assertions, and the Phase 1 database lane
  prove the complete migration graph before deployment.

## Lane 4 — privacy, rollback, lifecycle, and presentation

Result: P0=0, P1=0, launch-impacting P2=0.

- Legitimate public Rachi posts can appear on both platforms from the same
  authoritative query while deleted or non-public posts remain absent.
- The narrow special case does not create a user profile, session, role,
  Circle relationship, or ownership authority.
- Removing the successor restores the previous fail-closed Rachi behavior;
  no stored content or immutable evidence is rewritten or deleted.
- Android installed parity is explicitly withheld until the merged migration
  is deployed and Home is replayed on the device.

## Test-blind-spot closure

- The new pgTAP suite proves exact Rachi visibility, public-only flags,
  authenticated viewer binding, ordinary identity delegation, deleted-profile
  denial, write restriction, and helper ACLs.
- The repository guard now rejects a regression back to profile-only Rachi
  resolution and rejects broad write bypasses.
- Clean local reset, focused and adjacent visibility suites, TypeScript, lint,
  runtime, routes, Android guards, and Phase 1 Supabase integration pass.

## Assurance and physical tier posture

The historical control plane cannot bind PR #355 to the Owner-authorized
successor scope. Three Phase 1 jobs report only the enumerated assurance and
admission conditions after substantive suites pass. The Owner-authorized
continuation is recorded; no check is relabeled or falsely claimed as passed.

Installed Android Home parity and the wider installed/two-device matrix remain
separate tiers. This review does not substitute source, local database, or API
evidence for physical behavior.

## Merge posture

The exact implementation head is substantively green. This review-only branch
and pull request remain draft, retained, and never merged. If protected merge
is blocked solely by the enumerated assurance/admission drift, the narrow
Owner-authorized pull-request bypass may be used with enforcement active, a
normal two-parent merge, immediate restoration, and independent readback.

Production money, production payouts, and cashout remain off. No real charge,
payout, transfer, fabricated entitlement, provider transaction, Live, Event,
Circle relationship, pass, role, or balance was created. `production-v2` and
public store rollout remain untouched.
