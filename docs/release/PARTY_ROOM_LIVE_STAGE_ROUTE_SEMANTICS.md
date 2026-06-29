# Party Room / Live Stage Route Semantics Verification

Date: June 29, 2026

Verdict: Closed.

## Summary

Party Room and Live Stage are separate product routes. Party Room normal watch-party flow must not route to Live Stage.

- Player → Watch-Party Live → Party Waiting Room → Party Room remains intact.
- Home → Live Watch-Party → Live Waiting Room → Live Room → Live Stage remains intact.
- Party Room remains `/watch-party/[partyId]`.
- Live Stage remains `/watch-party/live-stage/[partyId]`.
- Legacy `/communication/*` remains compatibility-only.

## Root Cause

The validation cleanup in commit `418f5e4` correctly removed route-contract validation noise, but it also made the Party Room `Go Live` CTA own a direct handoff to `/watch-party/live-stage/[partyId]`. That blurred Party Room and Live Stage route ownership.

## Fix

The Party Room direct handoff to Live Stage was removed from `app/watch-party/[partyId].tsx`. Route guards now assert that Party Room does not include a direct `/watch-party/live-stage/[partyId]` navigation path. The two-client installed UI proof helper now opens the Live Stage route directly for live-room proof instead of using Party Room as a bridge.

## Results

Party Room route result: `/watch-party/[partyId]` remains the shared watch-party surface.

Live Stage route result: `/watch-party/live-stage/[partyId]` remains the Live Watch-Party / Live First surface.

Go Live / Party Live CTA result: Party Room no longer has an ambiguous `Go Live` CTA that sends users to Live Stage. Live Stage behavior remains owned by the live route.

Route-contract guard result: `npm run guard:route-contracts --if-present` passes.

Regression result: Player/Title Watch-Party Live entries still route through `/watch-party` waiting-room behavior and Party Room. Live waiting-room behavior remains owned by `app/watch-party/index.tsx` and the Live Stage component.

## Safety

No auth/RLS/chat/account-status permission weakening happened. No provider/live-money mutation happened. liveMoneyEnabled remains OFF.
