# Cognitive Foundation Rollback Plan

No cognitive component is deployed.

1. Revert hardening commits on `codex/cognitive-platform-hardening` in reverse order.
2. Discard any owner-only generated architecture artifact; the repository retains only its compact generator configuration.
3. Reset only the disposable local Supabase database when testing the undeployed migration.
4. Do not run a linked database down migration because no cognitive migration is authorized for deployment.
5. Close the stacked draft PR if the foundation is abandoned.

Existing autonomous systems remain unchanged and continue to be the only specialized production operators. There is no cognitive scheduler, function, credential, production task, or provider state to disable.

If a future repository action fails to roll back, the contract marks
`rollback_failed`, quarantines the task/branch/capabilities, stops child work,
creates immutable critical evidence and requires owner review. It never force
resets or force pushes.
