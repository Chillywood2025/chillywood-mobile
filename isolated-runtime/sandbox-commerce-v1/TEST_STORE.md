# Dedicated Test Store tip rehearsal

This source adds a disabled RevenueCat Test Store receipt path for one tip attempt
per dedicated DEBUG installation. It is a bounded rehearsal, not complete
repeatable checkout. No provider project, app, credential, native profile,
catalog entry or enabled route is included. Provider and device qualification
remain prerequisites to activation. Live payments, payouts and cashout remain
off; a Test Store receipt creates no access grant, Premium eligibility or payable
earnings.

## Installation and ownership

Install `test-store.sql` after `receipts.sql` and before
`permissions-finalize.sql`, inside the same new-schema installation transaction.
The combined managed-install harness includes all ten commerce SQL files. The
module uses the existing private core owner, FORCE RLS tables and two public
service-only wrappers, each protected by the existing one-shot PostgreSQL 17
transaction deadline. It adds no legacy function replacement, shared policy,
legacy grant writer or live observer change.

The connection identity is exactly RevenueCat project + Test Store app +
`TEST_STORE` + `SANDBOX`. Its economic application ID is
`rc_test_store:<project>:<app>`; it has no Apple/Google alias. Immutable connection
records require separate ownership, delivery and lifecycle evidence hashes before
qualification. Immutable compiled native profiles separately bind the app's
configuration digest to that connection. Both hashes are configuration identities,
not device attestation or provider authentication. The mutable private control row
starts with ingress and initiation disabled. No runtime client can create or
qualify these records.

The native `configurationDigest` uses the ordered descriptor documented by
`config/test-store-debug-v1.json` and `config/test-store-debug-config.ts`.
The webhook's `providerConfigurationDigest` is a separate connection value: a
webhook cannot choose a native platform profile. The dedicated webhook endpoint
has its own explicit secret/configuration variables and has no legacy credential
fallback or forwarding path.

## Command and receipt boundaries

`isolated-sandbox-test-store-v1` accepts protocol `isolated-test-store-v1`, a fresh
request UUID, exact current `expectedSessionId`, compiled `configurationDigest`
and one of these commands:

| Command | Payload | Effect |
| --- | --- | --- |
| `allocate` | `intentId`, `expectedQuote` | Reserve an immutable opaque provider customer ID and dispatch for the admitted tip. |
| `claim` | `intentId`, `dispatchId`, `expectedQuote` | The sole fresh reply can authorize one SDK invocation within the returned authority deadline. |
| `read` | `intentId` | Recover current server status with no provider mutation authority. |
| `report` | `intentId`, `dispatchId`, `outcome`, nullable `transactionHint` | Append an untrusted SDK observation, then return server status. |

`expectedQuote` contains exactly `offerId`, `offerRevision`, `resourceId`,
`resourceRevision`, `creatorId`, `kind: creator_tip`, `amountMinor` and lowercase
`currency`. The allocation also contains exact `productId`, project/app, provider
scope, economic application ID, native digest and purchase acceptance deadline.
The Edge adapter derives buyer/session from authenticated current Auth authority;
the request cannot choose a buyer. SQL binds those values to the original admitted
intent, dispatch and full quote. Claims take the existing nonwaiting authority
and own-row fences, and recheck deadlines after writes.

The command endpoint retains the existing authenticated gateway/getUser and
`wave1_session_authority_readback` dependency. Its adapter must match that returned
session to `session_id` in the exact token already validated by getUser; merely
parsing a token is not authentication. Local mocked transport tests do not qualify
the deployed gateway or readback function. SQL separately checks the actual
current Auth session and actor.

Only a fresh claim returns `dispatchAllowed: true` and an authority lease of at
most five seconds. Allocation, replay, report and read return false. A response
lost after a claim is an unknown mutation outcome; it does not authorize retry.
Every response retains `retryProviderMutation: false`, `grantsAccess: false` and
`notPayable: true`. SDK success/cancellation/failure cannot create a receipt or
prove native SDK quiescence. A current hold can coexist with an immutable earlier
receipt; callers must render the current hold while retaining that history.

`isolated-test-store-revenuecat-webhook-v1` authenticates the configured connection,
preserves exact raw bytes with authenticated encryption, derives observations from
those bytes and commits the raw parent before acknowledgement. A shared generic
normalized receipt RPC cannot confer Test Store source authority: the dedicated
projector creates a private transaction-bound call context from the stored raw
event and exact allocation. This private context is inaccessible to ordinary
service callers and is removed within the same transaction.

The positive family is strictly `NON_RENEWING_PURCHASE`, quantity one, USD with
exact minor-unit economics, no expiration, exact opaque customer/original customer
and no unexpected aliases. It joins the exact dispatch, not a current-candidate
or same-price heuristic. Original and transaction ownership are immutable.
Duplicates preserve history; different authenticated bytes under one event ID
hold the affected scope. Webhook-before-callback and historical completion after
retirement record provider truth without granting new initiation authority.

The only modeled automatic refund is a separately qualified
`CANCELLATION`/`CUSTOMER_SUPPORT` full negative tip amount. The provider event name
is preserved. Until actual lifecycle evidence qualifies that contract, cancellation
and unsupported refund/revocation semantics create holds. Productless transfers
hold every independently resolved opaque identity. Unknown identities or
unscopable evidence pause only this dedicated Test Store project; no global
Auth-user or legacy Apple/Google hold is fabricated. Prior negative evidence is
reapplied when original ownership arrives later, preventing resurrection.

## Native lifetime and unfinished repetition

The v1 native flavor reserves a durable installation-wide journal before any SDK
work, pins one provider identity and never automatically releases the reservation.
Read-only recovery remains available during an unresolved SDK call. Neither a
receipt nor a cancellation callback establishes that old native work can no
longer post. Account/session changes cannot switch the SDK identity while that
work may exist. These constraints intentionally limit v1 to one rehearsal attempt
per installation.

Repeated checkout requires a separately reviewed correlation contract. A proposed
stable provider identity plus a unique registered provider Offering per intent is
not implemented by this v1 module. It requires supported native propagation of
offering context, durable provisioning/reconciliation, exact authenticated
`presented_offering_id` evidence and real provider qualification. Missing context
must remain held. An SDK upgrade or mocked response alone does not establish those
provider facts.

## Verification and remaining qualification

The canonical runner (`scripts/ci/isolated-sandbox-native.mjs --plan`) declares the
exact current native and Node suites and binds all installed SQL, test fixtures,
Edge handlers and client/native sources by hash. Native fixtures use actual local
PostgreSQL 17.6 plus synthetic identities/provider bytes and real local encryption.
Fresh SQL responses are passed through the actual HTTP response validator and
client parser. The combined installer tests default-off configuration, final ACLs
and public-wrapper transaction deadlines. Existing receipt tests cover unchanged
Apple/Google/Stripe behavior. These checks do not prove a hosted installation,
provider authentication, SDK posting behavior or device delivery.

Before actual rehearsal, qualify the dedicated Test Store-only project/app and
credential placement, exact product and webhook field/economic/lifecycle behavior,
the native compiled application and identity/cache behavior, and the actual
backend's installation/Auth/role/transaction-timeout requirements. Real provider
events must traverse the authenticated endpoint, durable SQL receipt projection
and app recovery UI. Unsupported product families and repeat checkout remain
unavailable. This source is not authority for a production maintenance attempt or
for retrying any denied production metadata operation.
