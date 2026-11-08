# Exact current playback grant candidate

This fresh inactive add-on adds the service-only six-argument
`public.isolated_paid_video_resolve_playback_v3` RPC. Install `resolve.sql`
after the combined gateway and verified-media helper, before final public
CREATE revocation and permission finalization. It replaces no frozen function.

The checkout command is `resolve_playback` with exactly `{intentId}`. Its normal
checkout envelope has data exactly `{intent, currentGrantId,
accessRequiresCurrentAuthorization: true}`. `currentGrantId` is either
`scv1_grant_UUID` or null. No object coordinates, URL, playback lease or access
authority leave this read. The client must still obtain a fresh range lease.

The actor must currently authenticate for delivery. The historical intent must
belong to the buyer and the exact original preparation configuration. Its
retained quote must equal the immutable preparation quote. The resolver selects
the actual current resource grant, applies the unchanged gateway access checks,
and compares the full immutable media tuple with that quote.

Multiple verified purchases can retain different grant IDs for the same exact
video. A refunded, expired or closed historical intent can identify a different
currently valid owned grant for its exact media. The historical receipt is not
treated as ownership authority. Current provider holds, refund, gateway/media
retirement and buyer authority still govern access. Known current-access denials
yield null; contention and unexpected errors remain errors. Reads never create
or update grants, receipts, entitlements or provider objects.

The native fixture uses the selected published V2 Git baseline, modeled
non-superuser installation, actual public authoring/receipt/checkout SQL and
synthetic provider and scanner observations. This candidate does not establish
RevenueCat/device qualification, production permissions, deployment readiness or
capture-admission integration. See `publication-manifest.json` for the completed local
source proof when available.
