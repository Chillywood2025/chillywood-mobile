# Portable notification history controls

These five unified reverse patches replace test-time `git show` calls to local,
unpublished commits. Hosted CI needs only the checked-in source and fixtures.
They reconstruct the reviewed notification changes without copying either full
production module. `provenance.json` records each original commit/path, the
reviewed source baseline, and SHA-256 hashes of both complete source blobs.

Each patch was generated from the exact `c164ae241e81ce90e2b51f8bad86556cc23c2a78`
source to its listed original blob. The loader applies each hunk only when its
context matches exactly once. At that baseline it also requires byte-exact
original SHA-256 equivalence. This equivalence was checked against all five
original local Git blobs before the fixtures were committed.

Unrelated future source edits are preserved; relevant notification changes that
break a hunk require explicit fixture review. A reconstruction error is not a
passing negative control: the child must reach the named intended assertion,
exit 1 with `ERR_ASSERTION`, and have no loader/type/syntax/unhandled or cancelled
failures. `NODE_TEST_CONTEXT` is removed from nested runners.

The registration-only protocol change rebases the two helper reverse patches
against the reviewed new helper source. Their prior current-context behavioral
witness SHA-256 targets are unchanged. The updated provenance explicitly retains
`originalByteIdentityVerified: false`: those witnesses are not claimed to be
byte-identical copies of the original historical Git blobs. Settings fixtures
and the strict single-match reconstruction checks are unchanged.

Portability validation uses an invalid `GIT_DIR` while running the complete
negative-control suite, so no unpublished object can satisfy a test:

```sh
GIT_DIR=/tmp/notification-history-unavailable node --test \
  tests/notification-settings-negative-controls.test.mjs
```
