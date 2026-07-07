# Google-Signed v80 Live Stage Seat Request / Contract / Track Identity Proof

Date: 2026-07-07

Verdict: Source/guard/OTA complete; installed proof pending until synchronized Premium-active device proof.

## Summary

Live Stage was audited from source truth after installed testing showed the prior proof model was too shallow. The repair keeps the previous host/viewer presentation behavior, then fixes the request, contract, and video-identity rules that made installed behavior diverge from source proof.

## Source Fix

Changed files:

- `app/watch-party/live-stage/[partyId].tsx`
- `_lib/watch-party/live-stage-presentation.ts`
- `scripts/proof-live-stage-seat-approval.mjs`
- `scripts/guard-live-stage-approved-seats.mjs`
- `scripts/guard-live-stage-contract.mjs`
- `scripts/guard-watch-party-livekit-camera.mjs`
- `scripts/proof-live-room-moderation-incident-response.mjs`

Implemented behavior:

- seat requests carry a request version so X close suppresses duplicate/replayed pending broadcasts without deleting the request;
- only a genuinely new viewer request can clear the local close suppression and reopen the sheet;
- `Not now` clears/declines the current pending request while keeping the participant visible as listener/viewer;
- pending approval is sheet-only, with no inline pending `Approve Seat`, `Not now`, or direct `Seat Participant` card controls;
- desired speaker/canPublish state must match the active LiveKit join contract before the UI treats the viewer as publish-ready;
- downgraded viewer/no-publish contracts remain a syncing state, not silent publish success;
- participant-specific video tiles require exact identity-matched LiveKit tracks;
- missing participant tracks render an identity-safe fallback instead of another participant's feed;
- actual visual hero identity, focus/Featured styling, room authority, request state, LiveKit contract readiness, and participant-track identity are separate concepts;
- `Featured` remains secondary presentation styling and cannot replace the primary room-state label.

## Helper-Backed Proof

The Live Stage route now calls pure helpers from `_lib/watch-party/live-stage-presentation.ts`. `npm run proof:live-stage-seat-approval` imports that helper module and verifies behavior directly instead of reimplementing a fake model.

Proof coverage includes:

- host hero excludes host/self from the host party box and keeps the remote viewer visible;
- focus/Featured state does not remove the remote viewer;
- viewer default host-hero layout shows viewer/self as `You`;
- viewer self-hero is instant, keeps host first, and does not duplicate self;
- X close preserves request/card and duplicate pending does not reopen;
- `Not now` clears the request without removing the participant;
- `Bring on stage` targets the current pending participant;
- speaker-desired + viewer/no-publish contract is not publish-ready;
- speaker-desired + speaker/canPublish contract is publish-ready;
- participant tiles require exact LiveKit track identity.

## Validation

Passed before commit:

- `npm run check:livekit-routing-health` with local proof env loaded
- `npm run guard:livekit-heartbeat-monitor-policy`
- `npm run guard:premium-sandbox-policy`
- `npm run guard:watch-party-livekit`
- `npm run guard:old-room-handling`
- `npm run proof:live-stage-seat-approval`
- `npm run validate:runtime`
- `npm run guard:route-contracts --if-present`
- `npx tsc --noEmit`
- `deno check supabase/functions/livekit-token/index.ts`
- `git diff --check`
- `git diff --cached --check`
- changed-file secret scan

Backend health readback was green: one eligible LiveKit server, heartbeat under the 120-second cutoff, `chillywood-prod-01` healthy, and no fresh `no_eligible_livekit_server` blocker.

## Edge Function

No `supabase/functions/livekit-token/index.ts` source change or deploy was required in this lane. The function still deno-checks, and this lane did not change LiveKit routing, heartbeat, stale cutoff, registry, or token routing policy.

## OTA Result

- source commit: `cd1ec3b48423f2912009847f2fe9bab3057eb509`
- branch: `production`
- runtime: `1.0.0`
- update group: `c4f88243-f762-4b8d-a783-c7a1953ed2ea`
- Android update: `019f3b28-0935-74c5-bb84-b313eeecb11d`
- message: `Fix Live Stage request contract identity cd1ec3b`

No native build or Play submission happened.

## Installed Proof Plan

Installed proof must run only after both Play-installed phones load the OTA above.

Required proof:

1. host reaches Live Stage with UI showing `2 in room`;
2. host/self is hero/background and does not appear as `You HOST` in Chi'lly Party Members;
3. remote viewer/requester remains visible and tapping the card does not hide it;
4. `Featured` styling does not replace Viewer/Listener/Requesting/Speaker status;
5. viewer default layout shows self as `You`;
6. `Make me hero` is instant with no toggle-induced `Live feed syncing`;
7. self-hero shows host first and does not duplicate self;
8. X close closes only the sheet, preserves request/card, and duplicate pending does not reopen it;
9. `Not now` clears the request and keeps the participant visible;
10. viewer can request again;
11. `Bring on stage` seats the viewer;
12. viewer receives matching speaker/canPublish authority;
13. host sees correct viewer feed or an identity-safe fallback, never the wrong participant feed;
14. Stage remains `2 in room`.

## Safety

No Premium entitlement logic, Premium bypass, manual entitlement grant, Google Play / RevenueCat product logic, Watch-Party Party Room behavior, Android App Links, LiveKit heartbeat monitor, server registry, router eligibility, stale heartbeat cutoff, Chi'lly Chat/native calls, auth/RLS, production billing/provider settings, live money, payout/cashout, sideload, `adb install`, logout, clear data, uninstall, or reinstall changed.

## Out-of-Scope Findings

- Watch-Party Live sidecar installed playback proof still needs a separate rerun with real non-fixture Home media.
- Home/demo media naming still includes proof-fixture wording in prior installed proof and should be cleaned before public launch.
- Annual Premium base-plan/provider readiness remains separate from monthly sandbox Premium.
- Existing scanner noise around public-site/legal-site Supabase anon config literals remains non-blocking for this Live Stage lane.
- Local env health-check sourcing can produce parse warnings unless the correct dotenv path is used.
- LiveKit package export warnings remain non-blocking unless they produce a runtime failure.

None of these deferred items block the Live Stage source-truth repair. They should not be fixed in this lane unless installed proof shows they directly block Live Stage closure.
