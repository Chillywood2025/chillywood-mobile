# Google-Signed v80 Live Stage Seat Request / Contract / Track Identity Proof

Date: 2026-07-07

Verdict: Closed.

## Summary

Live Stage was audited from source truth after installed testing showed the prior proof model was too shallow. The repair keeps the previous host/viewer presentation behavior, then fixes the request, contract, and video-identity rules that made installed behavior diverge from source proof. Installed Google Play v80 proof on room `NXQ4M2` closed the lane after both devices renewed Premium through the approved Google Play / RevenueCat sandbox path.

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

## Installed Proof Result

Artifact folder: `/tmp/google-play-internal-v80-live-stage-source-truth-fix-20260707-002444/`

Final room: `NXQ4M2`

Device/build proof:

- `R5CR120QCBF`: package `com.chillywood.mobile`, installer `com.android.vending`, versionCode `80`, versionName `1.0.0`;
- `R3CXA0DS5JV` via wireless ADB endpoint `Android-2.local:43031`: package `com.chillywood.mobile`, installer `com.android.vending`, versionCode `80`, versionName `1.0.0`;
- OTA source commit `cd1ec3b48423f2912009847f2fe9bab3057eb509`, group `c4f88243-f762-4b8d-a783-c7a1953ed2ea`, Android update `019f3b28-0935-74c5-bb84-b313eeecb11d`, runtime `1.0.0`;
- both devices renewed Premium through the approved Google Play / RevenueCat sandbox flow and read back `Premium is active.`;
- backend LiveKit health was green before and after proof with one eligible server and heartbeat age under the 120-second cutoff.

Installed proof closed:

1. host reached Live Stage with UI showing `2 in room`;
2. host/self remained hero/background and did not appear as `You HOST` in Chi'lly Party Members;
3. host Chi'lly Party Members showed the remote viewer/requester, and tapping the remote card did not hide it;
4. `Featured` styling did not replace Viewer/Audience/Seat request/Seated status;
5. viewer default layout showed self as `You`;
6. `Make me hero` was instant and did not show toggle-induced `Live feed syncing`;
7. self-hero showed host first and did not duplicate self;
8. `Show host hero` restored the host-hero layout and returned self to the party box;
9. X close closed only the seat sheet, preserved request/card, and did not immediately reopen;
10. `Not now` cleared/declined the request and kept the participant visible as audience/listener;
11. viewer could request again;
12. `Bring on stage` seated the viewer;
13. viewer read back `Camera active` / `Camera seat active`;
14. host saw the viewer as `Seated` with identity-safe tile behavior, not the wrong participant feed;
15. Stage remained `2 in room`;
16. host identity and host-only controls remained unchanged.

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
