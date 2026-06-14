# 04 Platform Studio / Brand Studio Contract

## Purpose
Prove creator-tool access, non-Premium gate, Brand Studio draft save, owner-only draft preview, reviewed public preview, publish, and public brand readback without mixing Profile media with Platform Brand Studio media.

## Required Personas
- `premium_creator`
- `nonpremium_user`
- `normal_viewer`

## Required Runtime
Play/internal runtime only.

## Preconditions
- `premium_creator` has current Platform Studio access through approved Premium/operator test state.
- `nonpremium_user` lacks Platform Studio access.
- No live money or payout state is enabled.

## Steps
1. Log in as `nonpremium_user`.
2. Attempt Platform Studio.
3. Confirm clear Premium/operator gate.
4. Log in as `premium_creator`.
5. Open Platform Studio.
6. Open Brand Studio.
7. Confirm existing brand state loads and Hero Reel remains unavailable in normal UI.
8. Confirm creator Brand Studio does not label normal owned uploads as `Needs review`; draft/safe assets should guide the creator to `Ready to publish` / `Publish Changes`.
9. Choose a supported Hero Image test asset (JPG, PNG, or WebP).
10. Tap `Save Draft`.
11. Confirm one clear success/error notice appears and does not claim public publish.
12. Tap `Preview Brand Draft`.
13. Confirm `/channel/[creator]?preview=brand-draft` shows owner-only draft Brand Studio media and hides normal owner controls.
14. Return to Brand Studio and tap `Preview Platform`.
15. Confirm the public visitor view does not show unpublished draft media.
16. Tap `Publish Changes`.
17. Confirm one clear success/error notice appears after the publish path completes.
18. Confirm the creator Brand tab does not show `Approve`, `Reject`, `Archive`, or a creator-facing `Review & Publish` sheet.
19. Tap `Preview Platform` again and confirm eligible approved, scan-safe, published media appears publicly after publish path.
20. Log in as `normal_viewer`.
21. Open creator public Platform and confirm public brand state with no owner controls.
22. Confirm rejected, removed, scan-blocked, deleted, and unpublished assets stay hidden if fixtures are available.
23. Confirm Profile photo/background remain unchanged and separate from Platform hero/background/avatar/logo.

## Expected Result
Brand Studio is owner-only, Save Draft persists owner draft state without public exposure, Preview Brand Draft shows saved owner-only media, Preview Platform shows only public visitor state, Publish Changes exposes only eligible approved/scan-safe published media, creator-facing review controls stay hidden, and Profile media remains separate.

## Screenshots To Capture
- Non-Premium gate.
- Brand Studio loaded.
- Hero Image selected.
- Save Draft success.
- Owner-only Preview Brand Draft.
- Preview Platform before publish with pending media hidden.
- Publish Changes success.
- Reload persisted.
- Public viewer readback.

## Logs To Capture
- Sanitized brand save start/success/failure logs only.

## Pass Criteria
- Non-Premium gate is clear.
- Save Draft, draft preview, public preview, publish, reload, and public readback pass.
- Wrong-user edit unavailable or denied.
- Creator Brand Studio does not expose reviewer queue actions.
- Pending, rejected, removed, scan-blocked, and deleted assets stay hidden publicly.
- Profile photo/background remain separate from Platform Brand Studio media.

## Fail/Blocker Criteria
- Silent save failure.
- Viewer sees owner controls.
- Public readback does not match saved public state.

## Device Count
One device with account switching or two sessions.

## Google Play Purchase Required
No.

## Local Before BrowserStack
Yes. v53 local proof passed.
