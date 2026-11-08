# Exact social database deployment

This tool deploys only `20261107173220_creator_video_social_engagement` and
`20261107191000_comment_likes`. Their original version, name and complete Git
file bytes are recorded without rewriting any previous migration receipt.
It does not deploy the mobile application, publish an OTA update, enable live
money, configure providers, replay pending commerce migrations or repair history.

## Preconditions and scope

- Merge the focused tool PR only after exact-head Required Validation. Use its
  clean, committed source SHA. Review the two immutable migration hashes and
  helper-body allowlist in `scripts/social-engagement-deployment-manifest.json`.
- Obtain action-specific production deployment authorization. Source/PR approval
  alone is not deployment permission. Coordinate a short window with the sandbox
  operator; the tool shares exclusive advisory key `(176214,683)` with cutover.
- An existing authorized `SUPABASE_ACCESS_TOKEN` is required by the canonical
  Management API adapter. The tool never locates, saves, prints or creates one.
- Run `node scripts/social-engagement-exact-deploy.mjs --source FULL_SHA` first.
  It is read-only. Unrecognized helper bodies, partial targets, mismatched
  history/catalog, or non-off live-money/cashout/payout switches block the tool.
- A later independently authorized sandbox deployment can coexist: there is no
  hardcoded old history count or requirement to deploy its missing predecessors.
  Any change between the fresh read and lock acquisition fails the apply gate.
  Changed authority-helper bodies require explicit review and new qualification,
  not adding a hash merely to get past the gate.

## Apply and lock impact

After explicit approval, add `--apply` to the same exact-source command. One
bounded transaction locks migration history, money controls, auth users, source
videos/comments/posts/profiles and account deletion requests. Ordinary SELECTs
continue; writes including login/account updates may wait. This is not a
zero-downtime promise. Lock acquisition has a 5-second deadline; SQL statements
and idle transactions are bounded at 60 seconds. An occupied cutover key fails
immediately. Existing rows are preserved; only derived visible top-level video
discussion totals are backfilled into the new private counters.

The tool verifies unchanged prior history, existing catalog/ACLs/roles and all
money-control values, exact new catalog, empty new reaction relations and exact
backfill before committing both receipts. It sends a schema-cache notification
only within the successful transaction. No new public table grants are added.

## Outcome and recovery

- `plan_ready`: no mutation was requested.
- `already_applied_verified`: both exact receipts and the final catalog match;
  no write was sent. Stored user engagement is not reset.
- `applied_verified`: the single write was followed by a complete matching
  readback, including unchanged preexisting history/catalog/control fences.
- `apply_unconfirmed`: no second write is attempted. A timeout or an old read
  does not prove rollback. Reconcile using the read-only command after the active
  transaction has finished; if either receipt/catalog is partial or different,
  stop for investigation. Never rename/delete history or replay all migrations.

Tests cover historical/current full-schema SQL, atomic rollback and exact
receipts, strict source/transport boundaries, and a local native PostgreSQL clone
test of the advisory barrier and actual history-lock wait. Native clone evidence
is not production execution or installed-device proof. The UI must still be
released through its separately authorized platform/runtime channel workflow.
