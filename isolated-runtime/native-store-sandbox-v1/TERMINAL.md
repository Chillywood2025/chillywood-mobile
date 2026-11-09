# Terminal dispositions and active SKU slots

Source-only addition to the dormant native sandbox closure. No deployment,
provider qualification, purchase, or target record is authorized by this source.

`terminal.sql` must follow the real settlement effects module. It installs an
immutable owner-private terminal table and the authenticated service wrapper
`native_store_sandbox_terminal_v1`. The normal command envelope accepts only
`cancel-preparation` and `terminal-recover`, with a server-owned selection ID.

Cancellation obtains the original buyer reservation advisory lock and project
lock. It releases a reservation only when no committed attempt exists. A
selection without a reservation can be cancelled without creating one. A
consumed attempt, including an unknown client outcome, returns
`consumption_unresolved`; neither time nor an SDK cancellation releases it.
Terminal recovery reads the immutable result using current account/session
authority. Replaying a cancellation preserves its original request ID.

The owner-only allocation/refund helpers require authoritative effect, claim,
receipt/grant or tombstone relationships. The receipt allocator must invoke
them within the same transaction as the effects. Terminal records do not grant
access or change current authority/media/scanner checks.

Reservations retain selection and buyer/request uniqueness. The lifetime
buyer/SKU unique constraint is replaced by an active-reservation anti-join
against immutable terminals under the same buyer lock. Private armed
consumption acquires that lock and refuses terminal selections. No function
resets the original transaction budget inside an armed operation.

`terminal.native-cases.mjs` is a composed managed PostgreSQL harness extension,
not a fixture allocator. It covers cancellation/recovery, original slot
release, consumed holds, privilege boundaries, rollback, concurrent cancel vs
consume and abrupt client loss. Successful allocated/refunded terminals must
also be exercised through the real settlement worker. Until composed native
execution and review pass, these are candidate tests, not deployment evidence.
