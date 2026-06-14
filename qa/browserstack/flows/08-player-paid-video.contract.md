# 08 Player / Paid Video Contract

## Purpose
Prove normal Player behavior, Paid Video lock state, Unlock Video CTA, paid fan access if pre-proven, unpaid direct-link denial, and Premium separation.

## Required Personas
- `paid_video_fan`
- `unpaid_video_fan`
- `normal_viewer`

## Required Runtime
Play/internal runtime only.

## Preconditions
- Paid Video fixture id is current and documented before run.
- Paid fan has existing active access grant if not rerunning purchase.
- Do not rerun Google Play purchase unless explicitly approved and provider product is ready.

## Steps
1. Open a normal free video.
2. Confirm playback and controls render.
3. Log in as `unpaid_video_fan`.
4. Open paid video.
5. Confirm locked state and `Unlock Video`.
6. Attempt direct paid video link.
7. Confirm media source does not play.
8. Log in as `paid_video_fan`.
9. Open same paid video.
10. Confirm access unlocks from server grant.
11. Confirm Premium state is not required or changed.

## Expected Result
Paid Videos unlock only the purchased video and remain separate from Premium/Tips/other creator purchases.

## Screenshots To Capture
- Free Player.
- Paid locked state.
- Direct-link denial.
- Paid fan unlocked state.

## Logs To Capture
- Sanitized paid-video resolver/lock logs only.

## Pass Criteria
- Unpaid fan cannot play.
- Paid fan can play if fixture access is active.
- Premium does not bypass or change.

## Fail/Blocker Criteria
- Media source loads for unpaid user.
- Paid fan cannot access despite active grant.
- Premium or another creator purchase bypasses gate.

## Device Count
One device with account switching.

## Google Play Purchase Required
No for smoke; yes only if approved purchase rerun.

## Local Before BrowserStack
Yes. Sandbox proof docs remain canonical.
