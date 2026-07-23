# Cognitive Foundation Rollback Plan

No cognitive component is deployed.

1. Revert cognitive commits on `codex/cognitive-platform-foundation` in reverse order.
2. Regenerate or delete the local architecture snapshot.
3. Reset only the disposable local Supabase database when testing the undeployed migration.
4. Do not run a linked database down migration because no cognitive migration is authorized for deployment.
5. Close the stacked draft PR if the foundation is abandoned.

Existing autonomous systems remain unchanged and continue to be the only specialized production operators. There is no cognitive scheduler, function, credential, production task, or provider state to disable.
