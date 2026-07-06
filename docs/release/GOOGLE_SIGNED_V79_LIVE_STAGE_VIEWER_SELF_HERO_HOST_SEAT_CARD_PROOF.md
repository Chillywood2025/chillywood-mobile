# Google-Signed v79 Live Stage Viewer Self-Hero / Host Seat Card Proof

Date: 2026-07-05

Verdict: Partial.

## Summary

Live Stage UX is source-fixed, guard-covered, OTA-published, and backend LiveKit routing remains healthy. Installed closure remains Partial because the Google Play sandbox Premium renewal window expired before both Play-installed devices completed the two-device Stage proof at the same time. No Premium source logic, entitlement bypass, LiveKit backend routing, Watch-Party Party Room logic, Chi'lly Chat/native calls, auth/RLS, billing provider production setup, live money, payout, or cashout behavior changed.

## Manual Regression Report

Manual installed testing found two Live Stage UX defects after the earlier self-hero / seat-overlay source pass:

- Viewer default host-hero layout showed the host as hero but filtered viewer/self out of the party box. Tapping `Make me hero` changed the hero area to `Live feed syncing` instead of showing an immediate local self visual.
- On the host device, tapping the viewer/user card did not reliably open the seat-request sheet; the card could collapse or disappear, leaving no stable approve/dismiss path.

## Source Fix

Source commit: `3f49af76d50897947ac1a19bec4def2f22300875`

Files changed:

- `app/watch-party/live-stage/[partyId].tsx`
- `scripts/proof-live-stage-seat-approval.mjs`
- `scripts/guard-live-stage-approved-seats.mjs`
- `scripts/guard-watch-party-livekit-camera.mjs`

Implemented behavior:

- default host-hero layout includes viewer/self in the party box as `You`;
- viewer self-hero uses an immediate local camera/avatar/initials fallback instead of falling into `Live feed is syncing`;
- self-hero remains local-only UI state and does not change host identity, participant role, seat approval state, LiveKit room name, token grants, or other devices' layout;
- in self-hero mode, viewer/self is local hero, real host is first in the party box, and viewer/self is not duplicated in the party box;
- host pending requester card is an explicit accessible tap target and opens the seat-request sheet;
- tapping the pending requester card does not hide/remove/collapse the participant card or clear the request;
- X close only closes the sheet and keeps the request/card visible;
- `Not now` clears/declines the pending request according to the existing room model while keeping the participant visible as listener/viewer;
- `Bring on stage` still approves only the current pending participant.

## OTA Result

EAS Update was published to production Android runtime `1.0.0`:

- group: `860e3d56-c894-478a-92dc-7a0d2a0345de`
- Android update: `019f3526-e2bc-77a9-b3f3-27ab50b867a4`
- commit: `3f49af76d50897947ac1a19bec4def2f22300875`
- message: `Fix Live Stage self hero and seat card 3f49af7`

No native build was created.

## Backend Health

`npm run check:livekit-routing-health` passed with Supabase environment loaded. Redacted readback after OTA showed:

- `eligibleServerCount=1`
- `noEligibleServerCountRecent=0`
- `staleHeartbeatSeconds=120`
- `heartbeatAgeSeconds=5`
- `chillywood-prod-01.status=active`
- `livekitNodeStatus=healthy`
- `metricsSource=livekit-heartbeat-monitor`
- `rejectionReasons=[]`
- public WebSocket URL `wss://live.chillywoodstream.com`

No fresh `no_eligible_livekit_server` blocker was observed.

## Device / Build Proof

Both devices were visible over ADB and read back Google Play-installed v79:

- `R5CR120QCBF`: package `com.chillywood.mobile`, installer `com.android.vending`, versionCode `79`, versionName `1.0.0`
- `R3CXA0DS5JV`: package `com.chillywood.mobile`, installer `com.android.vending`, versionCode `79`, versionName `1.0.0`

No sideload, `adb install`, logout, clear data, uninstall, or reinstall happened.

## Sandbox Premium Renewal Handling

Google Play monthly sandbox Premium renewals expire quickly, roughly on a five-minute cadence. This proof used only the approved Google Play / RevenueCat sandbox path:

- R5 showed the Google Play sandbox sheet for `Chi'llywood Premium`, `$9.99/5 min`, test card approval, then read back `Premium is active.` with purchase completed.
- R3 initially missed the purchase CTA due a wrong tap coordinate, then used the correct `Start Sandbox Premium Test` CTA and completed the Google Play sandbox purchase.
- R3 later renewed again from the visible Premium-required gate and read back `Premium is active.` with purchase completed.

No Premium entitlement was manually granted, and no Premium gate was bypassed.

## Installed Proof Result

Installed proof remains Partial.

Reached:

- backend LiveKit health green;
- both devices Google Play-installed v79;
- both devices able to renew Premium through the approved sandbox path and read back active Premium at different points in the run;
- R5 created live room `TT8NTT`;
- R3 entered the correct Live room join flow, found room `TT8NTT`, and reached `Join Now`.

Not reached:

- Stage / `2 in room`;
- viewer default host-hero layout with self visible in party box;
- viewer `Make me hero` instant behavior;
- confirmation that `Live feed syncing` does not appear after toggle;
- self-hero party-box ordering on device;
- `Show host hero` return behavior;
- host pending card tap opening the sheet;
- installed X close / `Not now` / `Bring on stage` behavior.

Blocker:

- The short sandbox Premium window expired during navigation. After R3 reached `Join Now`, R3 hit the Premium-required gate. After R3 renewed again, R5 had expired and hit the Premium-required gate before `Continue to Live Stage`.

Classification:

- Premium source/gate behavior remains Closed.
- Backend LiveKit routing remains Closed.
- Live Stage UX source/guard proof is fixed.
- Installed Live Stage UX closure remains Partial due sandbox proof-window timing.

## Validation

Passed before source commit:

- `npm run check:livekit-routing-health`
- `npm run guard:livekit-heartbeat-monitor-policy`
- `npm run guard:premium-sandbox-policy`
- `npm run guard:watch-party-livekit`
- `npm run guard:old-room-handling`
- `npm run proof:live-stage-seat-approval`
- `npm run validate:runtime`
- `npm run guard:route-contracts --if-present`
- `npx tsc --noEmit`
- `git diff --check`
- `git diff --cached --check`
- changed-file secret-value scan

## Out-of-Scope Findings

No out-of-scope source defect requiring a fix was found during the Live Stage route review.

Deferred finding:

- Component/context: Google Play / RevenueCat sandbox Premium proof state.
- Observed risk: the monthly sandbox test subscription expires on a short cadence, making a two-device Live Stage installed proof fragile when both devices must be Premium-active simultaneously.
- User impact: proof attempts can be interrupted by legitimate Premium-required gates even when the app source and backend routing are healthy.
- Recommended next task: run a tightly coordinated installed proof immediately after renewing both devices, or use an owner-approved longer-lived sandbox/tester state if available without manual DB grants or production mutation.
- Touches: Premium sandbox/provider proof state only.
- Does not touch: Premium source logic, LiveKit backend, Chi'lly Chat/native calls, auth/RLS, production billing, live money, payout, or cashout.

## Safety

No Premium entitlement logic, Premium bypass, manual entitlement grant, Watch-Party Party Room logic, LiveKit heartbeat monitor/router eligibility, stale heartbeat cutoff, Chi'lly Chat, native call behavior, auth/RLS, provider production settings, live money, payout/cashout, sideload, `adb install`, logout, clear data, uninstall, or reinstall happened.

## Remaining Work

Rerun only the missing installed proof with both devices Premium-active in the same proof window:

1. host reaches Stage;
2. viewer default host-hero layout shows self in the party box;
3. viewer toggles `Make me hero`;
4. self becomes hero immediately, with no toggle-induced `Live feed syncing`;
5. real host appears first in the party box;
6. toggling off restores host-as-hero;
7. viewer requests a seat;
8. host taps the stable requester card and the sheet opens;
9. X close preserves request/card;
10. `Not now` clears request without removing participant;
11. viewer requests again;
12. host taps `Bring on stage`;
13. both devices reach Stage / `2 in room`;
14. host identity and controls remain unchanged.
