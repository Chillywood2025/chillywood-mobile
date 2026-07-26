# App Store Review Notes

Status: draft reviewer packet. Copy only facts verified against the exact submitted build. Do not place passwords, one-time codes, private room tokens, signed URLs, or provider credentials in this repository.

## Draft Notes for Review

Chi'llywood is an adult-oriented user-generated video, live-room, profile, channel, chat, and community application. A user can create an account, browse public content, open titles and player routes, follow profiles/channels, use reporting and blocking tools, contact support, and schedule account deletion from Settings.

The application requires sign-in for account-specific and communication features. Review credentials will be entered only in App Store Connect’s secure review-information fields. The submitted credentials must belong to a stable, non-owner reviewer account with no production money, staff, moderation, or administrative authority.

The reviewer can verify these controls:

1. Settings → legal/privacy opens Privacy, Terms, Community Guidelines, and Support.
2. Settings → account actions exposes account deletion. Reviewers should not execute deletion on the primary reviewer account.
3. A public profile/channel and a normal title/player route can be opened from Home or Explore.
4. User-generated content surfaces expose report controls, and user/profile communication surfaces expose block controls where context permits.
5. Sign-out is available from Settings.

Before copying these notes, Release Engineering must replace the following operational statements with exact submitted-build truth:

- Ordinary iOS notifications: state whether permission is optional and whether physical-device delivery has been proved.
- Native iOS incoming calls: state whether the runtime control is disabled. Do not describe CallKit/PushKit as functional without physical two-iPhone proof.
- Purchases: state exactly which App Store products are visible and reviewable. If Apple purchases remain disabled, do not advertise Premium, tips, tickets, VIP, paid videos, or creator subscriptions as purchasable on iOS.
- Live rooms and calls: state the bounded reviewer path and whether a second account is required.
- Account deletion: confirm the current restore window and any support/legal retention exceptions reflected in policy.

## Reviewer-account delivery

- Create two dedicated reviewer accounts through the normal application flow.
- Keep both accounts non-owner, non-admin, non-moderator, non-payout, and non-production-money.
- Seed only public-safe, licensed demonstration content.
- Put the primary account’s credentials only in App Store Connect review fields.
- Put second-account instructions in the review notes, but deliver any second password through Apple’s protected review field or another owner-approved secure channel—not Git or PR comments.
- Verify both accounts immediately before submission and after any backend migration.
- Record account ownership and rotation date in the private owner credential system, not this document.

## Two-account chat/live test plan

1. Sign in to the submitted iOS build with Reviewer Account A.
2. Sign in on an approved second client with Reviewer Account B.
3. From Account A, locate Account B by the seeded public handle and open the supported chat path.
4. Exchange one non-sensitive test message and verify report/block surfaces without filing an abusive report against a real user.
5. Join only the approved disposable live/test room.
6. Verify participant identity, leave behavior, and media cleanup. Do not claim native incoming-call parity unless it passed the final device matrix.
7. End the room and remove disposable messages/media according to the test-account cleanup procedure.

## Purchase review notes

- Each configured IAP must be visible and functional in the review build or explicitly explained.
- Tips must not unlock digital access.
- Purchases must never grant LiveKit host, publish, moderator, or admin authority.
- Restore Purchases must be visible when restorable products are enabled.
- Live money, payouts, cash-out, and payable creator balances remain off unless separately authorized in a future public-release lane.
- Provide the exact navigation path and seeded product/content fixture for every IAP submitted for review.

## Compliance notes requiring owner confirmation

- Encryption declaration currently relies on the repository’s non-exempt-encryption configuration; the owner must make the final export-compliance attestation.
- The service policy states users must be adults. The owner must complete Apple’s age-rating questionnaire truthfully for UGC, chat, live media, and unrestricted web content.
- Content rights, EU trader status, App Privacy answers, and review-account authorization require owner/legal confirmation.
- Do not claim Apple approval, TestFlight proof, purchase proof, push proof, or physical-device proof from source inspection alone.

References: [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/) and [Provide App Review information](https://developer.apple.com/help/app-store-connect/manage-submissions-to-app-review/provide-app-review-information/).
