# Supabase 2.100.0 Presence metadata backport

These private packages backport the descriptor-copy change from Supabase
[PR #2566](https://github.com/supabase/supabase-js/pull/2566), merge commit
`31dc1b0f4e9b21adb056cb799a2702bf1484919f`, onto the exact 2.100.0 registry
packages. The upstream Presence adapter mutates Phoenix-owned callback metadata,
removing the references needed to process later leaves. The patch copies the
metadata descriptors before renaming/removing references, including safe handling
of an own `__proto__` property.

Both package names remain upstream names; their private package version is
`2.100.0-chillywood.1`. Runtime dependencies and Node requirements are unchanged.
The root dependency override must resolve the Supabase client's exact upstream
Realtime dependency to this same private Realtime package. No postinstall runs.

The patch changes the Realtime TypeScript source, CommonJS and ESM adapters, and
the same embedded adapter in the Supabase browser UMD bundle. Supabase's CJS and
ESM entry points import Realtime and do not embed the adapter. The two stale
Realtime JavaScript source maps and their source-map comments are removed; the
UMD bundle ships no source map. Unchanged declaration maps continue to map only
the unchanged public declarations. Package metadata records the private version
and provenance. The upstream MIT license is retained here and added to both
packages because the registry archives omit its text. Every other package file
is preserved byte-for-byte.

`manifest.json` records registry integrity, complete source/output tree hashes,
archive integrity, and original/patched hashes for every changed or removed file.
The original registry `.tgz` files in `upstream/` are retained for offline rebuilds
and regression tests. No expanded upstream source tree is checked in.

From the repository root:

```sh
node scripts/build-supabase-presence-backport.mjs --check
node scripts/build-supabase-presence-backport.mjs --write
```

The default is `--check`, which makes no writes and verifies committed bytes
against two independent in-memory rebuilds. `--write` regenerates the artifacts
from the pinned local archives. Unknown input archives, trees, package identities,
patch anchors, or license bytes fail closed. Repeated builds are idempotent.

The builder uses sorted POSIX tar entries with fixed metadata and deterministic
gzip stored blocks, avoiding compression-library or operating-system differences.
The larger archives (about 1.2 MB combined) make byte-for-byte verification
portable across the supported Node runtimes. Runtime version constants remain
upstream 2.100.0; only package identity carries the private backport suffix.

Remove this backport after a reviewed upstream SDK upgrade includes the fix and
supports the project's runtime and consumers. The first upstream fix is in
2.110.9, whose Node requirement is newer than this project's Node 20 CI. Private
version identifiers can affect advisory matching: retain upstream 2.100.0 and
the unchanged transitive versions in dependency reviews. A clean audit count
does not establish the safety or correctness of this backport.

The builder exports `BACKPORTS`, `readTarGzip(buffer)`,
`patchFiles(definition, originalFiles, licenseBytes)`,
`createBackport(definition, archiveBytes, licenseBytes)`, and
`buildBackports({directory, write})`. Archive readers return a Map from relative
package paths to Buffers. Runtime regression tests are separate from packaging
verification and must exercise the actual installed adapter and browser bundle.
