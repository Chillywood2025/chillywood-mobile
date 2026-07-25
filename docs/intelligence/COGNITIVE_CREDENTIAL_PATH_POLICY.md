# Cognitive Credential Path Policy

The canonical policy is
`config/intelligence/cognitive-sensitive-path-policy.json`. It is shared by source,
runtime, and CI guards.

The executor rejects environment files; Git, SSH, cloud CLI, service-account,
Firebase Admin, Kubernetes, Docker, package-manager, database, signing, token,
vault, cache, and credential files; backup/copy/old/temp/swap variants; case and
Unicode variants; hidden/nested credential directories; generated native folders;
symlinks; submodules; and sensitive hard links when detectable.

The guard classifies paths without opening or printing the file. Absolute paths,
traversal, alternate remotes, and paths outside the approved repository and
capability scope remain denied.
