# Cognitive executor confinement

The executor is an undeployed source contract. It has no shell-string action.
Operational input is a closed action enum and typed argument array. The only
process specifications it can construct are fixed `git`, `npm`, or `npx`
invocations with `shell=false`; repository reads and patches remain internal
actions.

Permanent denials include arbitrary shell, `main`/`master`/release branches,
force-push, merge, tags, releases, workflow edits/dispatch, builds, deployments,
migration or function deployment, OTA, store submission, provider mutation,
money, auth/RLS, and roles.

The repository and remote are exact:

- `Chillywood2025/chillywood-mobile`
- `origin`

Path checks decode bounded URL encoding, normalize Unicode and separators, reject
absolute/traversal/credential/generated/workflow paths, walk existing parents
with `lstat`, reject symlinks and submodule/mount boundaries, resolve canonical
parents, and require the target to remain within both the repository and the
capability path scope. New files use the nearest existing canonical parent.

Native/release/migration/auth/RLS/role/money/provider paths require a separate
high-risk capability. Workflow files remain permanently outside executor
authority regardless of approval.

Regression: `guard:cognitive-executor-confinement` and
`test:cognitive-executor-confinement`.
