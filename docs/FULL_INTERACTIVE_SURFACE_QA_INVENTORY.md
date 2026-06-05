# Interactive Surface Inventory

Generated: 2026-06-05T18:27:36.625Z

This is a static inventory seed for manual/device QA. It counts interactive JSX markers and route/navigation markers so the QA matrix can track what must be tested. It is not proof that a control works.

## Summary

- Route files: 55
- Files with interactive markers: 68
- Total marker hits: 1180

## Route Files

- `app/(auth)/_layout.tsx`
- `app/(auth)/login.tsx`
- `app/(auth)/signup.tsx`
- `app/(tabs)/_layout.tsx`
- `app/(tabs)/explore.tsx`
- `app/(tabs)/index.tsx`
- `app/(tabs)/live.tsx`
- `app/(tabs)/my-list.tsx`
- `app/(tabs)/profile.tsx`
- `app/_layout.tsx`
- `app/account-deletion.tsx`
- `app/admin-money-sandbox-purchases.tsx`
- `app/admin.tsx`
- `app/beta-support.tsx`
- `app/channel-settings.tsx`
- `app/channel-studio/index.tsx`
- `app/channel/[userId].tsx`
- `app/chat/[threadId].tsx`
- `app/chat/index.tsx`
- `app/chilly-circle.tsx`
- `app/communication/[roomId].tsx`
- `app/communication/index.tsx`
- `app/community-guidelines.tsx`
- `app/copyright-report.tsx`
- `app/copyright.tsx`
- `app/counter-notice.tsx`
- `app/creator-monetization-setup.tsx`
- `app/creator-monetization.tsx`
- `app/creator-rules.tsx`
- `app/event/[eventId].tsx`
- `app/home.tsx`
- `app/law-enforcement.tsx`
- `app/library.tsx`
- `app/live-rules.tsx`
- `app/modal.tsx`
- `app/moderation-policy.tsx`
- `app/monetize.tsx`
- `app/payouts.tsx`
- `app/player/[id].tsx`
- `app/premium-terms.tsx`
- `app/privacy.tsx`
- `app/profile/[userId].tsx`
- `app/reset-password.tsx`
- `app/revenue.tsx`
- `app/settings.tsx`
- `app/spectate/[itemId].tsx`
- `app/subscribe.tsx`
- `app/support-policy.tsx`
- `app/support.tsx`
- `app/terms.tsx`
- `app/title/[id].tsx`
- `app/watch-party/[partyId].tsx`
- `app/watch-party/index.tsx`
- `app/watch-party/live-stage/[partyId].tsx`
- `app/watch-party/live-stage/index.tsx`

## Interactive Files

| File | Marker hits | Top markers |
| --- | ---: | --- |
| `app/admin.tsx` | 283 | onPress: 255, router.push\|replace\|back: 11, testID: 9, accessibilityRolebutton: 8 |
| `app/channel-settings.tsx` | 109 | onPress: 77, router.push\|replace\|back: 26, accessibilityRolebutton: 6 |
| `app/profile/[userId].tsx` | 79 | onPress: 41, router.push\|replace\|back: 27, testID: 7, accessibilityRolebutton: 2, <TextInput: 1, onLongPress: 1 |
| `app/player/[id].tsx` | 77 | onPress: 48, accessibilityRolebutton: 19, router.push\|replace\|back: 10 |
| `app/watch-party/live-stage/[partyId].tsx` | 66 | onPress: 34, accessibilityRolebutton: 13, testID: 10, router.push\|replace\|back: 7, <TextInput: 1, onLongPress: 1 |
| `app/settings.tsx` | 64 | onPress: 40, router.push\|replace\|back: 13, accessibilityRolebutton: 7, testID: 3, onValueChange: 1 |
| `components/profile/profile-media-sheets.tsx` | 49 | onPress: 28, testID: 20, accessibilityRolebutton: 1 |
| `app/chat/[threadId].tsx` | 43 | onPress: 23, testID: 12, router.push\|replace\|back: 7, onLongPress: 1 |
| `app/watch-party/[partyId].tsx` | 40 | onPress: 27, router.push\|replace\|back: 10, accessibilityRolebutton: 2, onLongPress: 1 |
| `app/(tabs)/explore.tsx` | 31 | testID: 12, onPress: 11, router.push\|replace\|back: 7, accessibilityRolebutton: 1 |
| `app/(tabs)/index.tsx` | 28 | onPress: 8, router.push\|replace\|back: 8, accessibilityRolebutton: 7, testID: 5 |
| `components/system/support-screen.tsx` | 19 | onPress: 10, router.push\|replace\|back: 9 |
| `app/chat/index.tsx` | 17 | onPress: 8, testID: 4, router.push\|replace\|back: 3, onLongPress: 2 |
| `app/channel/[userId].tsx` | 16 | onPress: 10, router.push\|replace\|back: 5, testID: 1 |
| `app/spectate/[itemId].tsx` | 14 | onPress: 8, router.push\|replace\|back: 6 |
| `app/watch-party/index.tsx` | 14 | onPress: 5, accessibilityRolebutton: 4, testID: 3, router.push\|replace\|back: 2 |
| `app/title/[id].tsx` | 12 | onPress: 8, router.push\|replace\|back: 4 |
| `app/counter-notice.tsx` | 10 | onPress: 9, router.push\|replace\|back: 1 |
| `app/subscribe.tsx` | 10 | onPress: 7, router.push\|replace\|back: 2, accessibilityRolebutton: 1 |
| `app/(auth)/signup.tsx` | 9 | href: 4, onPress: 3, router.push\|replace\|back: 2 |
| `app/chilly-circle.tsx` | 9 | onPress: 6, router.push\|replace\|back: 3 |
| `app/copyright-report.tsx` | 9 | onPress: 9 |
| `app/creator-monetization-setup.tsx` | 9 | onPress: 7, router.push\|replace\|back: 1, accessibilityRolebutton: 1 |
| `components/creator-media/creator-video-card.tsx` | 9 | onPress: 9 |
| `components/navigation/main-tab-top-bar.tsx` | 9 | testID: 3, onPress: 2, router.push\|replace\|back: 2, accessibilityRolebutton: 2 |
| `components/ProfileSocialFeedCard.tsx` | 9 | onPress: 9 |
| `app/(tabs)/my-list.tsx` | 8 | onPress: 4, router.push\|replace\|back: 4 |
| `components/dev/dev-debug-overlay.tsx` | 8 | onPress: 6, onLongPress: 1, testID: 1 |
| `components/ui/app-surface.tsx` | 8 | onPress: 4, accessibilityRolebutton: 3, testID: 1 |
| `app/(tabs)/live.tsx` | 7 | router.push\|replace\|back: 3, onPress: 2, accessibilityRolebutton: 2 |
| `app/(auth)/login.tsx` | 6 | testID: 3, onPress: 2, href: 1 |
| `app/admin-money-sandbox-purchases.tsx` | 6 | onPress: 3, accessibilityRolebutton: 3 |
| `components/beta/beta-feedback-sheet.tsx` | 6 | onPress: 6 |
| `components/safety/report-sheet.tsx` | 6 | onPress: 5, router.push\|replace\|back: 1 |
| `components/system/beta-access-screen.tsx` | 6 | router.push\|replace\|back: 4, onPress: 2 |
| `app/_layout.tsx` | 5 | router.push\|replace\|back: 5 |
| `components/monetization/access-sheet.tsx` | 5 | onPress: 5 |
| `components/social/social-attachment-action-sheet.tsx` | 5 | onPress: 4, accessibilityRolebutton: 1 |
| `app/(tabs)/profile.tsx` | 4 | router.push\|replace\|back: 2, onPress: 1, accessibilityRolebutton: 1 |
| `app/reset-password.tsx` | 4 | onPress: 2, router.push\|replace\|back: 2 |
| `components/chat/internal-invite-sheet.tsx` | 4 | onPress: 4 |
| `components/room/control-primitives.tsx` | 4 | onPress: 2, accessibilityRolebutton: 2 |
| `components/room/participant-detail-sheet.tsx` | 4 | onPress: 4 |
| `components/room/reaction-picker.tsx` | 4 | onPress: 4 |
| `app/communication/[roomId].tsx` | 3 | router.push\|replace\|back: 3 |
| `app/event/[eventId].tsx` | 3 | onPress: 1, router.push\|replace\|back: 1, accessibilityRolebutton: 1 |
| `components/communication/communication-control-bar.tsx` | 3 | onPress: 3 |
| `components/beta/beta-welcome-sheet.tsx` | 2 | onPress: 2 |
| `components/communication/communication-room-header.tsx` | 2 | onPress: 2 |
| `components/external-link.tsx` | 2 | onPress: 1, href: 1 |
| `components/legal/legal-policy-viewer.tsx` | 2 | onPress: 2 |
| `components/social/social-attachment-card.tsx` | 2 | onPress: 2 |
| `components/system/root-error-boundary.tsx` | 2 | onPress: 2 |
| `app/beta-support.tsx` | 1 | href: 1 |
| `app/communication/index.tsx` | 1 | href: 1 |
| `app/home.tsx` | 1 | href: 1 |
| `app/library.tsx` | 1 | href: 1 |
| `app/modal.tsx` | 1 | href: 1 |
| `app/monetize.tsx` | 1 | href: 1 |
| `app/payouts.tsx` | 1 | href: 1 |
| `app/revenue.tsx` | 1 | href: 1 |
| `components/communication/in-room-communication-panel.tsx` | 1 | onPress: 1 |
| `components/live/live-effects-sheet.tsx` | 1 | onPress: 1 |
| `components/room/live-bottom-strip.tsx` | 1 | onPress: 1 |
| `components/room/room-code-invite-card.tsx` | 1 | onPress: 1 |
| `components/social/linked-text.tsx` | 1 | onPress: 1 |
| `components/ui/collapsible.tsx` | 1 | onPress: 1 |
| `components/watch-party-live/livekit-stage-media-surface.tsx` | 1 | onPress: 1 |
