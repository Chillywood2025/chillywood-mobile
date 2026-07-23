# Collective Governance Architecture and Security Review

Reviewed source: `a1d2ec3545581b1904d94e6a72668789f2065ecb`

Decision: `ARCH_SECURITY_PASS_FOR_BOUNDED_LEVEL01_SOURCE`

Counts: P0=0, P1=0, P2=2, P3=1.

The review ran from a clean detached worktree under Node 20.20.2. All five prior
P1 findings were independently verified closed:

- the broker self-pass research RPC is unavailable to runtime roles;
- decision finalization and canary acceptance require support to exceed
  opposition;
- postflight binds state and result evidence to the broker record and consumed
  call;
- postflight requires the exact lease consumed for the resource;
- status-only evaluation is unavailable and subject verdicts derive from
  immutable evidence.

Fixed suites passed: Collective Governance 38/38, governance adversarial 33/33,
canonical red team 40/40, hardening regressions 104/104, runtime-authority
regressions 11/11, Edge boundary tests 8/8, policy corpus 20/20 plus 256
fixed-seed properties, and network/credential-path parity.

## Bounded residual findings

### CG-A-P2-001 — Owner/service dual-principal path fails closed but cannot run

The Owner-facing constitution and verified-canary RPCs require both an exact
authenticated Owner and a service identity token whose verifier also requires
the current JWT role to be `service_role`. The Edge function invokes these RPCs
with the authenticated actor client. That client fails the service-role check;
using a service-role client would fail the exact-Owner check.

This grants no unauthorized authority, but it blocks constitution activation and
verified canary acceptance. It is a deployment blocker. The frozen source must
not be bypassed or deployed as an operational canary path.

Required follow-up: design an explicit two-party protocol that records an
immutable Owner approval first, then lets the service principal act only against
that exact approval version. Add real local PostgREST integration coverage.

### CG-A-P2-002 — Model independence lacks provider-backed attestation

The database enforces distinct role, participant, and model hashes, but the
deliberation service supplies those hashes. Provider/router evidence does not yet
attest that distinct model identities produced the assessments.

Required follow-up: bind council assignments to verified model-router/provider
receipts before a model-backed deliberation canary.

### CG-A-P3-001 — Edge mocks do not reproduce database principal behavior

The eight Edge tests validate request/RPC contracts through mocks and therefore
cannot detect the authenticated-versus-service-role conflict.

Required follow-up: add a local authenticated PostgREST integration test before
deployment.

This review is not an approval, merge decision, or deployment authorization.
