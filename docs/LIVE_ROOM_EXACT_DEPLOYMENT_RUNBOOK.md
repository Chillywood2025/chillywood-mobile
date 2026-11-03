# Exact room-access/discovery deployment

This tool supports a narrowly scoped rollout; it is not standing production authorization.
Use only after exact-head Required Validation, diff review, action-specific owner
approval, verified transport/credential storage, and fresh production preflight.

## Scope

Project: `bmkkhihfbmsnnmcqkoly`. The immutable manifest binds only these ordered
migration versions:

`20261101194927`, `20261101194952`, `20261101201430`,
`20261101202330`, `20261101204701`, `20261101204816`,
`20261101210306`, `20261101211908`, `20261101214821`.

The matching Edge closure is `livekit-token` and the eight local source files in
the manifest. Do not include renderer migrations, sandbox cashout migrations,
other Edge functions, provider settings, keys, deletion, or financial activation.
Discovery enabled/collecting stays ON; primary delivery becomes ON and fallback
is retained. Money, payouts, cashout, rendering and deletion activation stay OFF.
Source parity is not provider-backed payment readiness or physical-device proof.

## Credential and transport boundary

The helper consumes an **already securely injected** `SUPABASE_ACCESS_TOKEN`.
It does not log or read a token file, extract a Keychain/keyring item, create a
credential, or copy credentials into the repository. An OS-keyring CLI login
alone does **not** supply this helper's environment credential. A separately
approved temporary login may use the narrow adapter below; it cannot select an
arbitrary saved credential or keyring item.

The official pinned Supabase CLI `2.109.1` source was inspected before selecting
an adapter:

- [`db query --linked` implementation](https://github.com/supabase/cli/blob/v2.109.1/apps/cli/src/legacy/commands/db/query/query.handler.ts)
  resolves a linked database connection first, including potential temporary
  database login-role creation, before sending its Management API query.
- [`link` implementation](https://github.com/supabase/cli/blob/v2.109.1/apps/cli-go/internal/link/link.go)
  retrieves project API keys and service configuration. It is not just a local
  project-name association.
- [`credential storage`](https://github.com/supabase/cli/blob/v2.109.1/apps/cli-go/internal/utils/access_token.go)
  prefers the OS credential store and falls back to a mode-0600 file. A private
  file in an ephemeral cloud HOME is not demonstrated durable storage.

Do not use either linked command under authorization that excludes those side
effects. Do not substitute secret extraction, an undocumented CLI override,
MCP `execute_sql` DDL, an auto-timestamped migration receipt, historical ledger
rewrites, or a blanket migration push. Use either supported secure vault injection
or the specifically approved fresh temporary-token bridge below. Linked-CLI side
effects still require separate authorization and qualification.
Do not create another credential merely because an execution session was lost.

## Approved temporary CLI session

This Linux-only adapter is for one newly approved token, not durable access.
Before preparing it, obtain action-specific authorization for the token's actual
scope, temporary local handling, and revocation. Complete source review and
Required Validation on the final helper, adapter, manifest and runbook first.

1. Run `node scripts/live-room-temporary-cli-session.mjs prepare --source SHA`.
   This creates a random `chillywood-room-deploy-` directory under `/tmp`, used
   as HOME, with mode 0700, and a mode-0700 `.supabase` directory. The token file
   must be absent. Its mode-0600 nonsecret receipt binds session ID, token name,
   source/tree and directory identities. Keep this exact token name for cleanup.
2. Use only the verified official CLI **2.109.1** executable for the new login.
   The receipt records the required version; it does not verify an executable.
   The operator must verify the actual pinned executable's `--version` output.
   Supply a clean, allowlisted process environment: the returned HOME,
   `SUPABASE_HOME=HOME/.supabase`, `SUPABASE_NO_KEYRING=1`, and ordinary PATH/locale
   settings. Do not inherit an access token, host, profile, preload, or binary
   override. Use the receipt's exact token name for `login --no-browser --name`.
   The [pinned credential layer](https://github.com/supabase/cli/blob/v2.109.1/apps/cli/src/legacy/auth/legacy-credentials.layer.ts)
   explicitly supports no-keyring mode and the fallback location. Do not use
   `--token`, print a token, copy it into chat, or read any existing credential.
   Finish the approved provider login securely and verify account/scope/name.
3. Run `node scripts/live-room-temporary-cli-session.mjs run --session ID
   --source SHA` for the read-only plan. The adapter opens only the session's new
   fallback file using pinned directory descriptors and no-follow opens. It
   requires current ownership, mode 0600, a regular single-link file, fresh
   creation and unchanged file identity. It passes the token only in the helper
   child's minimal environment, never argv, output, receipts, or repository.
   The helper's project and Management API destination remain hardcoded.
4. After all database gates, add `--apply` to that same invocation. An exclusive
   attempt marker is written before spawning. A second apply attempt is blocked,
   including after interruption. Read-only reconciliation remains available; do
   not reset the marker or create another credential to bypass an uncertain write.
   If a failure needs another deployment, reconcile and qualify the recovery first.
5. After verified DB closure, the approved Edge command may use the same isolated
   HOME, explicit SUPABASE_HOME and no-keyring setting internally. It must not
   link the project, retrieve configuration keys, or deploy other functions.
6. After completion or abort, reconcile any in-flight write, then revoke only the
   exact receipt-named token in Supabase and verify that revocation. Run
   `node scripts/live-room-temporary-cli-session.mjs cleanup --session ID
   --source SHA` to unlink only its validated local file. Cleanup retains the
   nonsecret identity receipt and explicitly does **not** claim provider
   revocation. Do not use a broad CLI logout/keyring deletion. If the process
   dies, use the preparation receipt to identify the token; never substitute a
   different saved credential. Ephemeral HOME contents can disappear on reset.

## Execution sequence after all gates are satisfied

1. Freeze the exact committed helper/manifest/source HEAD; preserve unrelated
   work. Inspect actual migration history, target function contracts/default ACL,
   room read policies, hold states and current Edge version/source again.
2. Run the helper without `--apply` with `--source FULL_COMMIT_SHA`. It must
   classify either the exact absent baseline or a fully verified already-applied
   closure. Partial/mismatched history or safeguards are a stop, not a repair
   invitation. All nine versions precede the previously observed ledger maximum;
   do not infer pending work from maximum version alone.
3. With the explicit database action approval, run the same frozen helper with
   `--apply`. It executes the original bodies and their exact version/name/body
   ledger records in one transaction with drift/hold/privacy checks. It does not
   repair or relabel historical migrations. On any uncertain response, reconcile
   independently; never retry a write just because an old read snapshot is empty.
4. Independently read all nine ledger records and every checked catalog contract.
   Verify sole authenticated scoped room-read policy and unchanged OFF holds,
   discovery ON, and no extra permissive read policy. Catalog parity does not
   authorize creating production test users, rooms, notifications or fixtures.
5. Only after verified DB closure, deploy **only** the matching Edge source. The
   pinned CLI supports `functions deploy livekit-token --project-ref
   bmkkhihfbmsnnmcqkoly --use-api --no-verify-jwt`. Never omit the function name
   (which deploys all functions), add `--prune`, or overwrite unrelated functions.
   Preserve the source's manual Bearer authentication and `verify_jwt=false`.
6. Independently read back Edge version, configuration and all eight file hashes;
   recheck migration/contracts/holds. External npm major-range imports in the
   qualified source are not frozen transitive-binary provenance.

## Compatibility and failure handling

Database first, then Edge is intentional: new Edge code requires the new room
generation, host-settings revision and listing-pause authorities. The database
closure revokes the old publication RPC before the Edge update; entry or
publication can fail during the interval. No zero-downtime or uninterrupted
existing-media claim is justified.

Existing publications/admission proofs are intentionally not backfilled. Hosts
may need to rejoin, refresh settings, or republish; old participant tokens may
need reconnecting. If deployment fails, stop and reconcile actual committed
state, then obtain/qualify forward repair. Never restore broad authenticated
room metadata reads or blindly roll back to incompatible old Edge code.
