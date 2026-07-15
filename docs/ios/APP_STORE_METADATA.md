# App Store Metadata

Status: repository draft. Marketing, Legal, and the owner must approve the final text in App Store Connect. Nothing here is an Apple acceptance or legal attestation.

## Core listing draft

| Field | Draft | Final gate |
| --- | --- | --- |
| Name | Chi'llywood | Confirm availability and trademark/content-rights review |
| Subtitle | Stream the city | Owner/Marketing approval; keep within Apple’s current limit |
| Primary category | Entertainment | Owner selects after reviewing Apple’s current category definitions |
| Secondary category | Social Networking | Owner confirms the social/UGC positioning |
| Version | 1.0.0 | Must match the uploaded build |
| Bundle ID | `com.chillywood.mobile` | Fixed |
| Privacy Policy URL | `https://chillywoodstream.com/privacy` | Recheck HTTPS content immediately before submission |
| Support URL | `https://chillywoodstream.com/support` | Recheck support ownership and response path |
| Marketing URL | `https://chillywoodstream.com/` | Optional; owner confirms public marketing readiness |
| Copyright | Owner legal entity and year required | Do not fabricate the legal owner |
| SKU | Owner-selected permanent internal identifier required | Do not invent or change casually |

## Promotional text draft

Stream the city through creator videos, community profiles, live moments, conversations, and shared watch experiences.

## Description draft

Chi'llywood brings creator video, community profiles, channels, live moments, and conversation into one city-inspired experience.

Explore public videos and creator updates, open titles in the player, follow profiles and channels, save content for later, and join supported live or watch-party experiences. Signed-in members can participate in community conversation using the controls available for their account and the current build.

Safety and account controls are part of the experience. Users can report content or behavior, block supported profiles or communication contexts, review community and legal policies, contact support, sign out, and schedule account deletion from Settings.

Feature availability can vary by build, account, device, region, and provider readiness. Purchases, native incoming calls, and notifications must not be described as available unless the exact submitted build and provider configuration have passed their release gates.

## Keywords draft

Chicago,creator video,live,community,watch party,channels,profiles,streaming,chat

Release Engineering must confirm the localized keyword field remains within Apple’s current character limit and does not repeat the app name unnecessarily.

## Age rating and content declarations

- Repository policy says the service is intended for adults age 18 and older.
- The owner must answer Apple’s questionnaire for user-generated content, chat/messaging, live audio/video, mature themes, web access, and moderation controls.
- Do not infer an App Store age rating solely from the policy’s adult-only rule.
- App Review must receive truthful notes about reporting, blocking, moderation, support, and reviewer access.

## Screenshot asset plan

No screenshot is generated or approved by this document. Use only disposable reviewer accounts, licensed demonstration media, and public-safe fixture names. Hide notifications and remove private data before capture. Do not show passwords, emails, tokens, private chats, private media, admin controls, purchase receipts, or signed URLs.

### Required delivery sets

| Set | Accepted portrait target | Purpose |
| --- | --- | --- |
| Large iPhone / 6.9-inch | `1320 × 2868`, `1290 × 2796`, or `1260 × 2736` | Primary App Store iPhone set |
| 13-inch iPad | `2064 × 2752` or `2048 × 2732` | Required because `supportsTablet` remains true |
| Standard iPhone QA / 6.1–6.3-inch | `1206 × 2622`, `1179 × 2556`, `1170 × 2532`, `1125 × 2436`, or `1080 × 2340` | Layout regression and optional upload where supported |
| Small iPhone QA | `750 × 1334` for a 4.7-inch target or `1242 × 2208` for a 5.5-inch target | Internal readability/cropping proof; upload only if App Store Connect requests it |

Apple permits one to ten screenshots per required display size. Keep one consistent visual story per localization and verify current sizes immediately before upload.

### Storyboard

1. Home — real public-safe creator/update content, no private notifications.
2. Explore — search/discovery with seeded public content.
3. Title/player — licensed demo title actively rendered, not a blank player.
4. Profile/channel — public-safe profile and channel identity.
5. Live/watch experience — only if the submitted build has an honest supported state; an intentional empty state is acceptable but not a feature claim.
6. Chat/community — seeded, non-private conversation only if App Review can reproduce it.
7. Settings/safety — Privacy, Support, report/block guidance, and account deletion entry.

Screenshots must show the application in use rather than only a splash screen or login page. If overlays are added, they must be accurate, legible, localized, and free of unsupported purchase or feature claims.

## Localization and rights checklist

- Confirm every displayed person, image, video, title, logo, and soundtrack is owned or licensed for store marketing.
- Confirm creator fixtures consent to public App Store display or use synthetic/app-owned fixtures.
- Keep metadata consistent with the final runtime kill switches.
- Localize description, keywords, privacy/support links, and screenshots only after the English source is approved.
- Do not claim “free,” pricing, subscriptions, or refunds unless App Store product configuration supports the statement.

References: [App information](https://developer.apple.com/help/app-store-connect/reference/app-information/app-information), [screenshot specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/), and [upload screenshots](https://developer.apple.com/help/app-store-connect/manage-app-information/upload-app-previews-and-screenshots/).
