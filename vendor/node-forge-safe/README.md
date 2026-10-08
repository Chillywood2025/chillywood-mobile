# node-forge DigestAlgorithm validation repair

This is a private, locally maintained repair of `node-forge` 1.4.0 for
[GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv).
As checked on October 8, 2026, the advisory lists no patched release and the
upstream repairs remain open. This package does not claim to be an official
fixed upstream version. Chi'llywood owns maintenance until a reviewed upstream
release supplies both checks.

The existing PKCS#1 v1.5 verifier validates ASN.1 node types and the outer
DigestInfo element count, but allows unconsumed nested DigestAlgorithm children.
The repair requires exactly the algorithm OID plus an optional NULL. The count
depends on whether the existing schema captured NULL: a two-child sequence with
an unrecognized second element cannot pass. When NULL is present its content
must be empty; otherwise arbitrary bytes remain possible inside that node.

The two checks follow the proposed upstream changes:

- [PR #1152](https://github.com/digitalbazaar/forge/pull/1152), commit
  `ceba34402e329f0365134f23fe19898756527d65`: nested element count.
- [PR #1157](https://github.com/digitalbazaar/forge/pull/1157), commit
  `683ab3344899cc08a581e4d5675a33e87aff7b04`: empty NULL content.

The repair applies to `lib/rsa.js` and the actual RSA implementation embedded in
both browser bundles. Their now-obsolete source maps and map comments are
removed. Package identity and provenance metadata identify the local repair as
`@chillywood/node-forge-safe` version `1.4.0-chillywood.1`, installed under the
existing `node-forge` dependency name. All other upstream files are preserved
byte-for-byte, including licenses, APIs, public entry points, Node requirements,
and the prime worker. No install hooks or registry publication are added.

`manifest.json` records the original registry SHA-512 integrity, SHA-256, full
file tree digest, output digests and all six modified/removed file records.
`upstream/node-forge-1.4.0.tgz` is the exact registry source. The retained upstream
RSA test (`upstream/rsa.test.txt`, an archival fixture) is byte-identical to the
recorded v1.4.0 Git blob. Both upstream and
output archives retain node-forge's BSD-3-Clause OR GPL-2.0 license text.

Run from the repository root:

```sh
node vendor/node-forge-safe/build.mjs --check
node --test tests/node-forge-digest-info-backport.test.mjs
```

`--check` performs an offline rebuild twice and compares the committed archive
and manifest. Unknown archives, trees, patch anchors or retained tests fail
closed. `--write` regenerates the output from those pinned local inputs. Fixed
tar metadata and stored DEFLATE blocks make archive bytes portable across Node
versions and operating systems.

Regression tests reproduce six malformed acceptances on original 1.4.0 and
reject them in CommonJS and both browser bundles with default parsing and
`_parseAllDigestBytes: false`. They independently remove each repair check to
prove that the intended vulnerability returns. Valid SHA signatures with absent
or empty NULL parameters, MD5's existing NULL requirement, PSS, NONE, signature
mismatch handling and actual installed Expo certificate/CSR/signature operations
remain covered. The malformed fixtures use ephemeral private test keys; they
prove parser acceptance and rejection, not a private-key-free forgery.

The unchanged upstream RSA suite also passed against the repaired package:
100 passing, 4 upstream platform/determinism skips. The original version remains
part of security review: private package names can affect advisory matching,
and a zero npm audit count alone does not establish that this repair is safe.
