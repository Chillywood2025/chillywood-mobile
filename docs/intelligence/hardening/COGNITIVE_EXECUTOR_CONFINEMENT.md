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
capability path scope. Existing targets are opened with no-follow file
descriptors and device/inode plus use-time canonical-path verification, so a
post-authorization file or parent swap cannot redirect the operation. The Node
runtime does not expose a reviewed descriptor-relative `openat` primitive, so
autonomous new-file creation fails closed before invocation. Enabling that action
later requires a separately reviewed native adapter that anchors creation to an
already-open parent descriptor; pathname-based exclusive creation is not
accepted as equivalent.

The action, branch, repository, every path, risk level, and primary resource are
compositionally bound to the capability before any budget is consumed. The
engine accepts only its own frozen, exact-prototype budget authority and reserves
at least one tool call and one concurrent slot itself. Plain-object and subclass
forgeries are rejected. Every
write requires a registered rollback coordinator; a postflight cancellation or
revocation restores the scoped change, and rollback failure quarantines rather
than accepting the result.

Native/release/migration/auth/RLS/role/money/provider paths require a separate
high-risk capability. Workflow files remain permanently outside executor
authority regardless of approval.

Regression: `guard:cognitive-executor-confinement` and
`test:cognitive-executor-confinement`.
