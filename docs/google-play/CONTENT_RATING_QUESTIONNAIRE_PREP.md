# Google Play Content Rating Questionnaire Prep

Date: 2026-05-30
Status: preparation only; Google Play/IARC rating completion remains external

This document prepares likely questionnaire areas. It does not complete the rating, assign a rating, or replace owner/legal review. Answer only based on the app behavior and content that will ship in the uploaded artifact.

June 1, 2026 external acceptance update: `docs/google-play/EXTERNAL_ACCEPTANCE_TRACKER.md` records Content Rating as prepared but not completed/accepted in this repo lane. Owner/legal must still complete the Play Console/IARC questionnaire and save the result/receipt outside the repo before this blocker can close.

## Product Facts To Carry Into The Questionnaire

| Area | Current repo truth | Suggested posture | Owner/legal confirmation |
| --- | --- | --- | --- |
| User-generated content | Profiles, Platform surfaces, posts, comments, replies, creator uploads, attachments, chat, rooms/live participation | Answer yes where asked about UGC or user interaction | Confirm final UGC policy and moderation owner |
| Live streaming / camera / microphone | LiveKit, Live Stage, Watch-Party Live, camera and microphone permissions | Answer yes where asked about live/user communication or camera/mic use | Confirm no retained live recording claim unless separately built |
| Chat/messaging | Chi'lly Chat and room/social communication exist where backed | Answer yes where asked about messaging/social interaction | Confirm retention/moderation posture |
| Public profiles | Profile and public Platform surfaces exist | Answer yes where asked about public profile/social identity | Confirm privacy settings and public visibility wording |
| Media uploads | Creator videos, profile media, social attachments, DMCA evidence attachments | Answer yes where asked about file/media upload or sharing | Confirm scan/status gates and unsupported content handling |
| Reports/block/moderation | Report flows, Admin Reports, Profile media actions, DMCA, moderation policies, scanner proof | Answer yes where asked about moderation/reporting controls | Confirm support/moderation staffing |
| Account creation | Supabase auth signup/sign-in exists | Answer yes for account creation/login | Confirm reviewer account and account deletion process |
| Purchases/subscriptions | Premium/RevenueCat/Google Play foundations exist; final build must be confirmed | Answer yes only if subscription purchase flow ships enabled | Confirm final provider/release state |
| Ads | No ad SDK/AD_ID found; sponsor/ads systems are scaffolded/admin-disabled | Answer no ads only if owner confirms no active ads/ad delivery/paid placement in submitted build | Owner confirmation required |
| News | Product is social streaming/creator video, not news | Answer no, unless owner changes product/category | Owner confirmation |
| Gambling | No app-feature evidence | Answer no unless future content/product changes | Owner confirmation |
| Real-money payouts | Not active; live money off | Do not claim payout/earnings/cash-out features are live | Owner confirmation |
| Children | Current policy says 18+ | Target adult/general audience, not children; evaluate Restrict Minor Access if offered | Legal confirmation |

## Content Areas

| Topic | Suggested answer guidance | Reason / evidence | Confidence |
| --- | --- | --- | --- |
| Violence | The app does not promote violence as a product feature, but UGC may violate policy and is covered by moderation. | Community Guidelines and report/moderation docs | Medium; owner must answer based on expected content policy |
| Sexual content / nudity | The app should not market sexual content; UGC rules prohibit sexual exploitation and unsafe content. | Legal policies | Medium; owner/legal must confirm adult-content posture |
| Drugs / alcohol / tobacco | No product feature evidence. UGC policy should prohibit illegal activity. | Legal policies | Medium |
| Hate / harassment | Not promoted; user interaction exists and moderation policies cover harassment/hate. | Community Guidelines, report flows | High |
| Profanity / language | User-generated chat/comments/live may contain user language. | UGC/social surfaces | Medium; answer according to expected moderation policy |
| User interaction | Yes. Chat, comments, follows/Chi'lly Circle, rooms/live, Profile/Platform social surfaces. | App routes/docs | High |
| Location sharing | No app location feature evidence. | No location package/permission found | Medium; verify SDK disclosures |
| Digital purchases | Conditional. Premium purchase flow must match final uploaded build. | RevenueCat/Google docs and runtime validation | Needs owner confirmation |
| Ads served in app | No active ad SDK/ad delivery by repo evidence. | Ad SDK scan, store checklist | Needs owner confirmation |

## Target Audience Guidance

Recommended owner/legal posture:

- Do not target children.
- Use adult/general audience selections that match current 18+ policy.
- Review whether Play offers or requires Restrict Minor Access for the selected audience and UGC/live/chat features.
- Do not use child-directed screenshots, cartoon marketing, or copy that suggests the app is for children.

## Fields That Must Not Be Answered Incorrectly

- Do not answer "No user-generated content."
- Do not answer "No user interaction."
- Do not answer "No camera or microphone" if the uploaded artifact includes LiveKit/camera/mic features.
- Do not answer "No data collected."
- Do not claim live payouts, cash-out, ad revenue, paid creator content, or tips.
- Do not claim legal/attorney approval or Play acceptance from repo docs.

## Evidence

- `docs/google-play/DATA_SAFETY_EVIDENCE_MAP.md`
- `docs/google-play/PLAY_CONSOLE_FIELD_BY_FIELD_ANSWERS.md`
- `docs/legal/LEGAL_LAUNCH_CHECKLIST.md`
- `docs/legal/MODERATION_REPORTING_WORKFLOW.md`
- `docs/security/MALWARE_SCANNING_READINESS_PLAN.md`
- Android legal proof: `/tmp/chillywood-google-play-acceptance-closeout-20260530/android/`

## Remaining External Step

Owner/operator completes the Play Console Content Rating questionnaire, saves the IARC/result receipt outside the repo, and updates the blocker map only with non-secret proof status.
