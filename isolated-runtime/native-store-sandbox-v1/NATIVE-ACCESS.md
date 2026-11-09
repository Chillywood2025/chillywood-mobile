# Native private video access (source only)

This is a distinct native-store access path, not a conversion to Test Store V3.
Existing Test Store proof, gateway and player contracts remain unchanged.

`native-access.sql` depends on the native allocator's owner-private
`native_store_assert_current_allocation(receipt, buyer)` helper. That helper must
recheck the original journal, processing effect, allocation and link, mapping and
dispatch qualification, revocations, pending events and negative tombstones under
the common project lock. A generic verified receipt alone is insufficient. The
service-only public wrapper arms the existing transaction budget once. The SQL
then requires current account authority, exact grant, delivery authority, clean
scanner-bound asset and current private gateway/object evidence.

The separate `native-store-paid-video-range-v1` Edge endpoint requires JWT
verification and both its own enable flag and the existing gateway flag. Both
remain off by default. Each bounded private range rechecks exact native allocation
and object identity before and after origin fetch. No public URL, purchase,
settlement, restore fallback or runtime configuration is created by this source.

The normal-player adapter accepts the genuine `NativeSandboxQuote` plus resource
and grant IDs. Credentials remain volatile, account transitions retire the lease,
and every range still requires server authorization. The short playback lease is
not a durable grant or permission to serve future bytes.

The pinned runtime profile binds the exact endpoint import graph, two explicit
private transport modules, Deno 2.9.6 and the frozen Supabase SDK lock. CI executes
the endpoint with modeled dependencies and tests protocol substitution, post-fetch
revocation, account changes, expiry, routing restrictions and lock tampering.
These tests do not establish hosted/provider qualification. The SQL module is not
yet in the fixed installer closure: genuine allocator-to-SQL-to-Edge range tests
and the resulting source/catalog pins must be completed before integration.
