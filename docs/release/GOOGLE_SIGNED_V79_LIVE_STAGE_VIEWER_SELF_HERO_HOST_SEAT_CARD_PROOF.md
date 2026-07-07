# Google-Signed v79 Live Stage Viewer Self-Hero / Host Seat Card Proof

Date: 2026-07-05; continued 2026-07-06

Verdict: Partial.

## Summary

Live Stage UX is source-fixed, guard-covered, OTA-published, and backend LiveKit routing remains healthy. The July 6 continuation fixed two additional installed defects found during proof: the Live Watch-Party hybrid member deck could auto-hide after entry, and the host seat-request sheet could immediately reopen after X close because pending-request auto-open ignored a local close. Installed closure remains Partial because after the latest OTA the R5 Google Play sandbox Premium entitlement expired at stage entry, Restore returned `Premium is not active`, and the sandbox purchase CTA entered `Premium purchases are temporarily unavailable while setup is being finalized.` No Premium source logic, entitlement bypass, LiveKit backend routing, Watch-Party Party Room logic, Chi'lly Chat/native calls, auth/RLS, billing provider production setup, live money, payout, or cashout behavior changed.

July 6 repo-alignment continuation: source/guard proof is now on `origin/main` at `fae20e2930f9511077bc0c1e5732cbdb793f6294`. The temporary local-only commit `ba78ca3eb787052a54836e74b469d40c1d936f49` was applied to GitHub as an equivalent remote tree because shell GitHub credentials were unavailable. Fresh EAS Update from this aligned source was published to production Android runtime `1.0.0`: group `8e8bb31c-74e8-4699-b2bc-d53fdf32a84b`, Android update `019f3a7f-be4d-7917-bf8a-0f55124f5a9a`, message `Fix Live Stage host viewer presentation a496991`. This final source polish keeps the host as the actual visual hero on the host device, excludes host/self from the host Chi'lly Party Members box, keeps remote viewer/requester cards visible while focused/tapped, and makes `Featured` a focus style only rather than a primary room-state label. The deployed `livekit-token` Edge Function and shared function files hash-match `origin/main`; the server-backed `enforce-participant-state` / `persistMembershipState` path is still deployed and represented in source for Live Stage seat authority fallback. Post-alignment validation passed. Installed proof remains the next phase on Google Play v80+ with this latest OTA loaded.

## Manual Regression Report

Manual installed testing found two Live Stage UX defects after the earlier self-hero / seat-overlay source pass:

- Viewer default host-hero layout showed the host as hero but filtered viewer/self out of the party box. Tapping `Make me hero` changed the hero area to `Live feed syncing` instead of showing an immediate local self visual.
- On the host device, tapping the viewer/user card did not reliably open the seat-request sheet; the card could collapse or disappear, leaving no stable approve/dismiss path.

## Source Fix

Initial source commit: `3f49af76d50897947ac1a19bec4def2f22300875`

July 6 continuation commits:

- `6c527608fb60a56bcfdee3aab3ce1245962485f6` - fixed Live Stage self-hero and host seat persistence fallback.
- `65c0697e19a1ad7ac3addf01a5910746fe3b273d` - kept the Live Watch-Party hybrid member deck visible after stage entry.
- `c189731167bf374a5eac5a98fd6f0e1fcbfa227e` - raised the host seat sheet touch layer.
- `a6c57ad7bef9ec6dd245cad332850aaf9cf474e5` - fixed seat sheet X-close semantics so a locally closed pending sheet does not immediately auto-reopen, while the pending card can reopen it.
- `fae20e2930f9511077bc0c1e5732cbdb793f6294` - aligned the final Live Stage host/viewer presentation polish on `origin/main`; host/self is excluded from the host member box when host/self is the actual visual hero, remote viewer/requester cards remain visible on focus/tap, and `Featured` cannot replace primary room-state status.

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
- host mode filters the party box by actual visual hero identity, not by the focused participant;
- `Featured` is secondary focus styling only, while primary status remains room-state based;
- X close only closes the sheet and keeps the request/card visible;
- `Not now` clears/declines the pending request according to the existing room model while keeping the participant visible as listener/viewer;
- `Bring on stage` still approves only the current pending participant.

## OTA Result

EAS Update was published to production Android runtime `1.0.0`:

- group: `860e3d56-c894-478a-92dc-7a0d2a0345de`
- Android update: `019f3526-e2bc-77a9-b3f3-27ab50b867a4`
- commit: `3f49af76d50897947ac1a19bec4def2f22300875`
- message: `Fix Live Stage self hero and seat card 3f49af7`

Continuation OTAs on production Android runtime `1.0.0`:

- group `b71ef63a-0876-4c1d-abb0-f3c7f7d6535f`, Android update `019f38ff-14c9-763e-8934-f9ae0db03944`, commit `6c527608fb60a56bcfdee3aab3ce1245962485f6`
- group `d322cfc6-0980-4601-b2fb-43052c296971`, Android update `019f3914-8cb8-73f3-b467-4d47b6b23c99`, commit `65c0697e19a1ad7ac3addf01a5910746fe3b273d`
- group `7bee4094-b1c5-41a7-ba26-3d043c3e5f42`, Android update `019f392d-3504-7700-8705-35e7ce02c766`, commit `c189731167bf374a5eac5a98fd6f0e1fcbfa227e`
- group `39b39ecf-294f-4eaa-bcb1-cc835a311efd`, Android update `019f3946-e907-7468-9d3a-0515ea050aa2`, commit `a6c57ad7bef9ec6dd245cad332850aaf9cf474e5`

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

Both devices were visible over ADB. The original proof used Google Play-installed v79; after the App Links internal build, the July 6 continuation read back Google Play-installed versionCode `80`, versionName `1.0.0`, installer `com.android.vending` on both devices:

- `R5CR120QCBF`: package `com.chillywood.mobile`, installer `com.android.vending`, versionCode `80`, versionName `1.0.0`
- `R3CXA0DS5JV`: package `com.chillywood.mobile`, installer `com.android.vending`, versionCode `80`, versionName `1.0.0`

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
- both devices Google Play-installed from `com.android.vending`;
- both devices able to renew Premium through the approved sandbox path and read back active Premium at different points in the run;
- R5 created live room `TT8NTT`;
- R3 entered the correct Live room join flow, found room `TT8NTT`, and reached `Join Now`.
- July 6 Packet A on room `993HVB` proved default host-hero layout shows viewer/self in the party box, `Make me hero` switches immediately to local self hero with `Local self view` and no toggle-induced `Live feed syncing`, host appears first in the party box, self is not duplicated, and `Show host hero` returns to host-as-hero.
- July 6 latest-OTA room `W555BH` proved R3 could reach Live Stage with `2 in room`, default host hero, and viewer/self visible as `You` in the party box after the hybrid deck visibility fix.
- R5 received a host seat-request sheet for R3 after the touch-layer fix, proving request delivery and sheet rendering still work.

Not reached:

- installed proof after the final X-close semantics OTA for X close, `Not now`, `Bring on stage`, and final Stage / `2 in room` seated/speaker state.

Blocker:

- The short sandbox Premium window expired during navigation. In the first pass, after R3 reached `Join Now`, R3 hit the Premium-required gate, and after R3 renewed again, R5 had expired before `Continue to Live Stage`.
- In the July 6 continuation after the latest X-close OTA, both devices initially read back `Premium is active`; R5 created room `W555BH`, R3 joined and reached Live Stage, and then R5 expired at stage entry. R5 Restore returned `Restore complete. Premium is not active.`, and the sandbox purchase CTA became disabled with `Premium purchases are temporarily unavailable while setup is being finalized.`

Classification:

- Premium source/gate behavior remains Closed.
- Backend LiveKit routing remains Closed.
- Live Stage UX source/guard proof is fixed, including the July 6 deck visibility and X-close semantics fixes.
- Installed Live Stage UX closure remains Partial due R5 Google Play / RevenueCat sandbox Premium availability after expiry.

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
