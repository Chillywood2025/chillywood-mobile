# Collective Governance Database, RLS, and Control-Plane Review

Reviewed source: `a1d2ec3545581b1904d94e6a72668789f2065ecb`

Decision: `DATABASE_RLS_PASS_FOR_BOUNDED_LEVEL01_CANARY`

Counts: P0=0, P1=0, P2=1, P3=0.

The review used a clean detached worktree and a disposable local Supabase reset
through migration `20260723184340_cognitive_collective_authority_closeout`.
Serial focused pgTAP passed 360/360:

- cognitive foundation: 245/245;
- Collective Governance: 71/71;
- Level 0/1 canary control plane: 24/24;
- security-policy parity: 20/20.

The Node 20 concurrency test passed with one current finding, two occurrences,
and two immutable lifecycle events.

All five prior database P1 findings were independently verified closed:

- assignment, role, and participant identity are composite-FK bound, and veto
  and dissent authority is constitution-scoped;
- the decision hash content-binds assessments, votes, vetoes, dissent, and
  stakeholder impacts;
- capability consumption and postflight bind the exact lease, resource, call,
  and immutable settlement;
- physical/provider proof uses task-scoped verified-external-evidence composite
  foreign keys;
- canary acceptance uses the exact authenticated Owner identity and a separate
  service identity requirement.

All inspected cognitive and governance tables use RLS and FORCE RLS. Direct
mutating table privileges are unavailable to `anon`, `authenticated`, and
`service_role`. New security-definer RPCs use a fixed empty `search_path`.

## Bounded residual finding

### CG-B-P2-001 — Focused pgTAP fixtures are serial, not parallel isolated

A combined parallel run passed 359/360 because one foundation assertion counted
a task row concurrently inserted by another fixture. Serial execution passed
360/360 and no authorization bypass was demonstrated.

Required follow-up: namespace or transaction-isolate the four focused fixtures
before treating parallel execution as authoritative. CI must continue using the
known serial contract meanwhile.

This review is not an approval, merge decision, or deployment authorization.
