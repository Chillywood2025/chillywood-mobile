# Google-Signed v79 Live Stage Self-Hero / Seat Overlay Proof

Date: 2026-07-05

Verdict: Partial.

## 2026-07-05 Follow-Up

This proof is superseded for current source status by `docs/release/GOOGLE_SIGNED_V79_LIVE_STAGE_VIEWER_SELF_HERO_HOST_SEAT_CARD_PROOF.md`.

Follow-up source commit `3f49af76d50897947ac1a19bec4def2f22300875` fixes the manual installed regressions found after this pass:

- default host-hero layout includes viewer/self in the party box as `You`;
- viewer self-hero uses an immediate local camera/avatar/initials fallback instead of falling into `Live feed is syncing`;
- the real host remains first in the party box while self-hero is enabled;
- host tapping a pending requester card opens the seat-request sheet without hiding/removing/collapsing the participant card;
- X close only closes the sheet and preserves the pending request/card;
- `Not now` clears/declines the current request while keeping the participant visible as listener/viewer;
- `Bring on stage` still targets only the current pending participant.

The follow-up EAS Update production Android runtime `1.0.0` published group `860e3d56-c894-478a-92dc-7a0d2a0345de`, Android update `019f3526-e2bc-77a9-b3f3-27ab50b867a4`, commit `3f49af76d50897947ac1a19bec4def2f22300875`.

Installed proof remains Partial after the follow-up because the Google Play sandbox Premium renewal window expired before both Play-installed devices completed the two-device Stage proof. R5 created live room `TT8NTT`, R3 found the room and reached `Join Now`, then R3 hit the Premium-required gate after sandbox expiry and R5 later hit the Premium-required gate before `Continue to Live Stage`. This is not a LiveKit routing/heartbeat regression, not a Premium source regression, and not a reason to loosen gates or manually grant entitlement.

## Summary

Live Stage room UX is source-fixed and OTA-published, and the latest installed closure attempt proved a Premium-active R3 can host and enter Live Stage on Google Play-installed v79. Installed closure remains Partial because the second proof phone, R5, still cannot become Premium active or join the Premium-gated Live Stage path: it shows `Premium purchases are temporarily unavailable while setup is being finalized.`, restore keeps Premium inactive, and Testing details shows `Sandbox setup unavailable.` The missing installed proof is now the two-device Stage / `2 in room` state plus host seat-overlay approve/dismiss and viewer self-hero toggling.

This lane did not change Premium entitlement logic, Watch-Party Party Room logic, LiveKit heartbeat/router eligibility, Chi'lly Chat/native calls, auth/RLS, provider production settings, live money, payout/cashout, or native code.

## Source Result

Source commit: `50db5cabf237b42d269aac15f45120ebcb983a03`

Files changed:

- `app/watch-party/live-stage/[partyId].tsx`
- `scripts/proof-live-stage-seat-approval.mjs`
- `scripts/guard-live-stage-approved-seats.mjs`
- `scripts/guard-watch-party-livekit-camera.mjs`

Implemented behavior:

- viewer-only local `Make me hero` / `Show host hero` Live Stage control;
- self-hero mode is local-only UI state and does not change host identity, participant role, seat approval state, LiveKit room name, token grants, or other devices' layout;
- self-hero mode makes the viewer/self the local hero, keeps the real host first in the party box, then renders remaining participants in stable order;
- viewer/self is not duplicated in the party box while self-hero is enabled;
- host seat-request sheet now has `Bring on stage`, `Not now`, and close actions;
- Android back closes the seat-request sheet safely;
- approve targets the current pending participant, refreshes stale/gone/full cases without crashing, and closes the sheet after success or safe refresh.

## OTA Result

EAS Update was published to production runtime `1.0.0`:

- group: `8f893072-9032-4051-af17-a56f002cc28b`
- Android update: `019f348b-5787-7a5c-90f1-298d4b86bd20`
- commit: `50db5cabf237b42d269aac15f45120ebcb983a03`
- message: `Live Stage self hero and seat request overlay`

No native build was created.

## Backend Health

`npm run check:livekit-routing-health` passed with the Supabase environment loaded from the local project environment. Redacted readback showed:

- `eligibleServerCount=1`
- `noEligibleServerCountRecent=0`
- `staleHeartbeatSeconds=120`
- `chillywood-prod-01.status=active`
- heartbeat age under cutoff at readback time
- no rejection reasons
- redacted `live-stage` token summary success

The first combined validation log also contains an expected local environment failure for the same command when run without Supabase env. The clean backend-health log is stored separately in the artifact folder.

## Device Proof

Artifact folder: `/tmp/google-play-internal-v79-live-stage-self-hero-seat-overlay-proof-20260705-180402/`

Latest installed proof subfolder: `/tmp/google-play-internal-v79-live-stage-self-hero-seat-overlay-proof-20260705-180402/installed-proof-closure-20260705-200158/`

Device readback:

- `R5CR120QCBF`: package `com.chillywood.mobile`, installer `com.android.vending`, versionCode `79`, versionName `1.0.0`
- `R3CXA0DS5JV`: package `com.chillywood.mobile`, installer `com.android.vending`, versionCode `79`, versionName `1.0.0`

Earlier installed proof reached:

- R5 created live room `KLLMSX`;
- R3 completed the approved Google Play / RevenueCat sandbox Premium flow;
- R3 read back `Premium is active.`;
- R3 joined the same live room;
- installed room state showed R3 in the room with the R5 host before Stage entry.

Latest installed proof reached:

- backend LiveKit health passed with `eligibleServerCount=1`, heartbeat age under cutoff, and fresh `live-stage:success` token audit;
- R3 was still Google Play-installed v79 and completed/read back Premium active through the approved sandbox flow;
- R3 created live room `T7S75E`;
- R3 tapped `Continue to Live Stage`;
- R3 reached `LIVE STAGE` as host with visible `Host-led live`, `Audience waiting`, comments/reaction controls, and no LiveKit unavailable error.

Installed proof still did not reach:

- host seat-request overlay;
- host dismiss / approve actions;
- Stage / `2 in room`;
- viewer self-hero toggle in Stage.

Reason: the only second physical proof phone, R5, remained non-Premium and was blocked at the Premium-required Live Stage gate. Its purchase path showed `Premium purchases are temporarily unavailable while setup is being finalized.`, restore read back `Premium is not active.`, and Testing details showed `Sandbox setup unavailable.` No Premium entitlement was manually granted, and no gate was bypassed.

## Validation

Passed:

- `npm run check:livekit-routing-health` with Supabase env loaded
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

## Safety

No Premium entitlement logic, Premium bypass, manual entitlement grant, Watch-Party Party Room logic, LiveKit heartbeat monitor/router eligibility, stale heartbeat cutoff, Chi'lly Chat, native call behavior, auth/RLS, provider production settings, live money, payout/cashout, sideload, `adb install`, logout, clear data, uninstall, or reinstall happened.

## Remaining Work

Use an approved Premium-active host account/device or repair the R5 sandbox Premium setup. Then rerun only the missing installed Live Stage proof:

1. host reaches Stage;
2. viewer requests a seat;
3. host dismisses safely;
4. viewer can request again;
5. host approves / brings viewer on stage;
6. both devices reach Stage / `2 in room`;
7. viewer toggles `Make me hero`;
8. viewer becomes local hero, host appears first in the party box;
9. toggling off restores host-as-hero layout;
10. host role/controls remain unchanged.
