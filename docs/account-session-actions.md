# Settings account actions retain their initiating session

Settings confirmation callbacks and logout cleanup belong to the user and auth
session generation that initiated them. A later sign-in must never become the
subject of their deletion RPC, device cleanup, local session removal or routing.

## Feature and compatibility scope

The selected feature is `auth-session-password-recovery` in
`config/assurance/feature-registry-v1.json`, with the existing Settings route and
`notifications-fcm` / `pushkit-callkit` cleanup dependencies. The affected UI is
Settings' Delete Account, Restore Account, confirmation alerts and Log Out.
Accessibility labels, touch targets and the thirty-day restoration copy remain
unchanged. Android and iOS use the same account binding; iOS alone has native
VoIP registration cleanup. Supabase Auth, AsyncStorage (native), localStorage
(web), Expo notification ownership and the existing native call bridge are the
relevant boundaries. No native module or provider contract is added.

Cases include active, signed out, authority loading/unknown, scheduled deletion
(restore-only), same-session refresh, replacement account, same-user new session,
late success/failure and unmounted/replaced screens. Failure preserves the
session when the auth server rejects logout, while the SDK-compatible missing or
expired-user responses still permit exact local cleanup. Notification cleanup
remains best-effort, bound to its initiating owner. Duplicate in-flight actions
are suppressed per mounted session scope.

Deletion and restoration use the existing frozen-token RPC transport. Only the
two account lifecycle RPCs accept a restore-only state change on settlement;
they still reject a different user, account or session generation. Scheduling
and restoration change no deployed SQL or server authorization.

## SDK boundary

The pinned SDK's public `signOut()` can reread a successor session and removes
local storage unconditionally after its network request. Password and OTP
sign-ins do not share all of its auth locking. The adapter therefore:

1. Holds the SDK auth lock to keep token refresh from starting during logout.
2. Reads local session storage without invoking implicit token refresh.
3. Checks the initiating user/session against the stored token and any available
   published authority, and freezes the token for the global logout request.
4. Serializes conditional cleanup against every SDK storage mutation, including
   sign-in saves that bypass the SDK auth lock.
5. Emits SIGNED_OUT before a queued replacement save can complete.
6. Filters stale SIGNED_OUT events against local storage and event revision
   before application and SDK realtime subscribers consume them.

Web contexts use a distinct navigator storage lock where Web Locks are available;
this must not reuse the SDK's lock name. Multi-context browser behavior without
Web Locks is not qualified. Native cleanup has one storage adapter per app
runtime. Private SDK hooks are intentionally limited to the already pinned auth
client; the SDK regression suite must run when that dependency changes.

Global sign-out semantics are preserved. This revokes all refresh sessions of the
initiating user. A same-user reauthentication race can preserve the new local
session without promising that its remote refresh authority survives that global
request. A different user's remote session is never sent as the logout subject.

## Validation and rollout

`tests/account-session-actions-sdk.test.mjs` runs the pinned real SDK with in-memory
storage and a closed fake HTTP transport. It includes the original public SDK
failure, exact global requests, local replacement preservation, queued refresh,
expired-token behavior, unavailable authority and delayed broadcast delivery.
`tests/settings-account-actions-mounted.test.mjs` mounts the real Settings screen
and account-bound deletion transport, covering delayed confirmations, settlement,
cleanup and restoration. The iOS foreground-call suite exercises the actual
serialized facade with a modeled native module and backend.

These are source/runtime tests, not real account deletion, device push delivery,
installed CallKit, or physical Android/iOS proof. Required validation, independent
review and installed golden cases remain release gates: same-account logout,
delete/cancel/restore, replacement account during each delayed action, Android
notification ownership and iOS registration preservation. No deployment or OTA
is part of this source change. Rollback is a source revert and compatible app
release; no migration or stored-session format rollback is required.
