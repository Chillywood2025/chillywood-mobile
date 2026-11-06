# Automatic commerce Edge preparation

This tool prepares canonical Supabase `deploy_edge_function` arguments for the
eight existing endpoints affected by PR 683. It never deploys, reads credentials,
calls a provider, changes JWT settings, activates a money control, or schedules
the optional provider observer. The old rollout and cashout manifests remain
unchanged and cannot qualify this new source.

The manifest pins project `bmkkhihfbmsnnmcqkoly`, the observed function identities,
versions, JWT policies, complete local dependency closures before the change,
and the exact reviewed PR 683 application bytes. The baseline captures were
independently compared with `ff1211fab1c5bba31939ab341f1f4ba744b23081`; every
file matched. Application source is merged commit
`abed523a21535d7854b3dbad51f1aa8b70bdb17d`, tree
`808ba06732ae32caac4276465df269ae7a75015a`. The source-only baseline fixture pins
those old bytes for repeatable preparation tests without Git history access.

First complete the separately qualified atomic database cutover and its
readback. Do not upload an initiating endpoint against an intermediate SQL
state. Capture each current endpoint through `get_edge_function` immediately
before its individual operation and retain the capture outside Git. Use a clean,
reviewed, committed checkout containing this tool:

    node ops/automatic-commerce-edge/prepare.mjs --source FULL_REVIEWED_COMMIT_SHA --function NAME --capture /private/task/capture.json

The output is an argument object, not a completed deployment. Invoke only the
canonical deployment tool under action-specific deployment authority. Preserve
existing JWT policies. Restore updated completion/webhook endpoints before
initiators. Do not deploy the new observer, enable its control, modify cron,
change provider credentials, or enable live money as a side effect.

After each accepted upload, independently capture the actual deployed files and
metadata, then run the same command with `--readback`. Only a higher deployment
version with the exact expected source closure and unchanged identity/JWT is
`already_applied_verified`. Another version with old or different bytes is a
blocker, not permission to overwrite concurrent work. Reconcile an uncertain
write using this readback; do not repeat it blindly.

These checks prove deployed source bytes and policy, not request propagation,
provider delivery, funds movement, current Premium, legal acceptance, or
installed app behavior. Keep live payments and payouts disabled. The existing
cashout controls and qualification records must remain unchanged. Actual
sandbox purchases or payouts need their own bounded authorization and evidence.

If rollout stops after the database cutover, preserve the verified database and
already updated endpoints, hold the affected operation, and diagnose before
continuing. Do not restore old SQL or old cashout logic automatically. Any
forward repair requires source review and fresh validation.

Run `node --test tests/automatic-commerce-edge-preparation.test.mjs`.
