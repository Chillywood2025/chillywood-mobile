# Historical Google refund/tax deployment fixture

This test-only closure preserves bytes verified against repository base commit
`ff1211fab1c5bba31939ab341f1f4ba744b23081`. Its unchanged deployment manifest
records the original November 4 deployment preparation and remains pending
independent post-predecessor qualification. This is not current-source,
deployment, provider, or native concurrency proof.

`closure.json` pins every loader and Edge dependency by SHA-256. Unchanged files
are reused from the checkout only if their original digest matches. The original
configuration is stored as `config.toml.txt`; the original shared Stripe helper
reuses the already frozen sandbox cashout fixture. Both snapshots were verified
byte-for-byte against the base commit and the Edge manifest hashes.

Tests materialize this closure and invoke the unchanged production bundle loader.
They require no historical Git objects, network, credentials, or live access.
The changed current Stripe helper must still fail the historical manifest.
