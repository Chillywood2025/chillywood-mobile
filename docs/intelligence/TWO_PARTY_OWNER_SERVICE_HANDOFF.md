# Two-Party Owner Service Handoff

Status: source implemented, not deployed in this branch.

The activation path is split into two identities and two requests.

1. Owner approval recording uses `supabase/functions/cognitive-owner-approval`.
   It uses the normal authenticated JWT path and the `SUPABASE_ANON_KEY`.
   It does not read `SUPABASE_SERVICE_ROLE_KEY`, does not claim execution, and
   does not execute switches or tools.

2. Service execution uses `supabase/functions/cognitive-approved-action-worker`.
   It requires the server-only invocation proof hash and a server-only worker
   assertion. The database verifies a `service_role` JWT claim plus a registered
   assertion hash before any service-only RPC can claim or execute an action.

The legacy direct switch RPC `governance_set_level01_switch` now fails closed
with `two_party_owner_approval_required`. This prevents an authenticated Owner
request from serving as the service-execution request.

Implemented database surfaces:

- `governance_owner_approval_records`
- `governance_owner_approval_versions`
- `governance_owner_approval_version_states`
- `governance_owner_approval_lifecycle_events`
- `governance_approved_action_executions`
- `governance_two_party_service_assertions`

The service-principal registry supports explicit Owner revocation through
`governance_revoke_two_party_service_principal`. A revoked service assertion can
no longer satisfy `governance_assert_two_party_service_principal`, and the
revocation records only a sanitized revocation hash, actor ID, and timestamp.
The verifier is volatile and locks the matched active assertion row before
authorizing execution, so an in-flight Owner revocation serializes with service
authorization rather than racing as an unlocked read.

Execution liveness remains strict for side-effect and success paths. When an
Owner revokes approval or emergency stop activates after side effects begin, the
worker cannot complete successfully, but it can still enter the cleanup-only
rollback/quarantine path through `governance_lock_approved_execution_cleanup_scope`.
That path exists only to preserve evidence, revoke/settle authority, and
escalate failed cleanup; it cannot execute a new approved action.

Generic worker state transitions cannot enter `postflight`. `postflight` is set
only by operation-specific execution RPCs, such as
`governance_execute_approved_switch`, after the exact approved side effect and
target-resource hash are verified.

`product_intelligence_operator` is now included in the Owner approval request
allowlist and in the emergency-stop database gate used by the two-party worker
for product-quality activation tasks.

Local proof:

- `supabase test db`: 716/716 pgTAP tests passed.
- `npm run test:cognitive-two-party-handoff`: passed.
- `deno check` passed for both new Edge Functions and the modified governance
  control function.

No deployment, scheduler enablement, model credential, GitHub write credential,
build, OTA, store mutation, merge, or production authority is performed by this
source branch.
