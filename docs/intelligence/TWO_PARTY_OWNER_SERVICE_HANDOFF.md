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

Local proof:

- `supabase test db`: 669/669 pgTAP tests passed.
- `npm run test:cognitive-two-party-handoff`: passed.
- `deno check` passed for both new Edge Functions and the modified governance
  control function.

No deployment, scheduler enablement, model credential, GitHub write credential,
build, OTA, store mutation, merge, or production authority is performed by this
source branch.
