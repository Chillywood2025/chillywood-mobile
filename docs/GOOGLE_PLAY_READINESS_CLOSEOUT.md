# Chi'llywood Google Play Readiness Closeout

Date: 2026-06-21
Status: Android-first Play readiness map; docs/ops only

This closeout uses the current repo truth and the current official Google Play help topics for App content, Data safety, account deletion, target audience, and content rating. It does not claim Play Console acceptance because console state must be verified by the owner inside Play Console.

## Executive Decision

Chi'llywood is not ready for broad Google Play public release today.

No app-code blocker was found in this pass. The remaining blockers are release-ops, legal/store acceptance, provider dashboard signoff, and final proof:

- Google Play Console App content must be verified and saved.
- Data Safety must be owner/legal verified and accepted.
- Account deletion URL/path must be verified and accepted.
- Content rating and target audience must be completed honestly for an 18+ UGC/live/chat app.
- Store listing/contact/support/privacy details must be verified.
- Provider dashboard signoff is needed for Supabase, Firebase, RevenueCat/Google Play, LiveKit/TURN, email/SMTP, legal site, support inbox, and rollback/monitoring.
- Final Play-installed Android smoke is needed on the release candidate.
- Fresh creator upload-to-playback proof remains pending.
- RevenueCat/Google Play production billing governance is needed if paid public launch includes Premium or any creator digital purchase.

BrowserStack/App Live is intentionally deferred until iOS integration is ready and is not a current Android-first launch blocker unless the owner changes that decision.

## Package / Build Identity

| Item | Current evidence | Status | Owner action | Code needed? |
| --- | --- | --- | --- | --- |
| Package id | `app.json` and native Android config use `com.chillywood.mobile`. | Ready | Confirm uploaded artifact package in Play Console. | No |
| App name | `app.json` uses `Chi'llywood`; visible copy policy requires `Chi'llywood`. | Ready | Confirm Play listing exact spelling. | No |
| Version name | `app.json` uses `1.0.0`; native Gradle checked local `versionName "1.0.0"`. | Ready for current runtime | Confirm final release version strategy. | No unless version bump required |
| Runtime version | `runtimeVersion` is `1.0.0`; production EAS channel points at runtime `1.0.0`. | Ready | Keep runtime unchanged for OTA-compatible updates. | No |
| Version code | EAS production builds auto-increment; historical Play/internal v53 is documented, local native Gradle has stale `versionCode 24`. | Needs owner/release verification | Confirm the latest Play track artifact versionCode before submission/promotion. | New build only if Play track needs a fresh traceable artifact |
| OTA vs build | Recent signup/money polish was JS-only and OTA-published to production branch. | OTA enough for compatible installed testers | For public release, owner must decide whether OTA-on-current-Play-artifact is acceptable or whether to upload a fresh traceable AAB. | Not required by this docs pass |
| Signing | EAS production profile is store AAB; older local Gradle release signing was debug and must not be used. | EAS/Play signing required | Use EAS/Play signing or verified Play-managed signing, not local debug artifact. | No app code |

## App Access / Sign-In Details

Google Play review needs App access details because account features require sign-in.

Current repo truth:

- Public browsing and legal/support surfaces can be inspected without signing in.
- Account features require sign-in.
- Use non-admin reviewer account `play-reviewer-app-access@chillywoodstream.com`.
- Password must be entered only in Play Console or secure handoff; never commit it.
- Admin/owner routes remain gated and are not needed for consumer review unless separately requested.
- Purchases/live money/payouts are sandbox/off unless the owner explicitly opens a licensed tester path.

Use `docs/GOOGLE_PLAY_APP_ACCESS_DRAFT.md` for the current ready-to-paste draft.

## Privacy Policy

| Requirement | Evidence | Status | Owner action | Code needed? |
| --- | --- | --- | --- | --- |
| Public Privacy URL | `https://chillywoodstream.com/privacy`; in-app `app/privacy.tsx`; legal source `legal/policies.mjs`. | URL/content ready | Confirm URL loads from Play reviewer network and enter in Play Console. | No |
| In-app link | Signup/settings/legal routes include Privacy. | Ready | Final Play-installed smoke. | No |
| Scope | Policy covers accounts, profile, chat/messages, uploads/media, camera/mic, purchases/providers, analytics/crash, moderation, support, deletion/retention. | Draft ready | Attorney/legal approval and provider disclosure review. | No |
| Data Safety consistency | Existing evidence map and new worksheet flag owner-verify fields. | Needs owner verification | Confirm Firebase/RevenueCat/Google/LiveKit/Supabase exact collection and sharing. | No |

## Account Deletion

| Requirement | Evidence | Status | Owner action | Code needed? |
| --- | --- | --- | --- | --- |
| In-app path | Settings account actions include Delete Account and account deletion policy route. | Ready for smoke | Verify on final Play-installed release candidate. | No |
| Public web path | `https://chillywoodstream.com/account-deletion`. | URL/content ready | Enter/verify in Play Console Data deletion section and save proof. | No |
| Scope wording | Current copy says scheduled deletion, 30-day restore window, and retention exceptions for legal/safety/fraud/billing/moderation/copyright. | Honest, not overclaimed | Owner/legal must approve permanent purge/de-identification SLA. | No |
| Play acceptance | Not provable from repo. | Blocker until accepted | Owner captures Play Console accepted/saved state. | No |

Use `docs/google-play/ACCOUNT_DELETION_URL_CONTENT.md` plus the draft in `docs/GOOGLE_PLAY_READINESS_CLOSEOUT.md`.

### Ready-To-Paste Account Deletion Answer

```text
Chi'llywood users can request deletion in the app from Settings > Account actions > Delete Account. The in-app flow schedules account deletion and provides a 30-day restore window.

Users can also review the public deletion instructions at:
https://chillywoodstream.com/account-deletion

The request covers account profile identity and account-linked app data where legally and technically permitted. Chi'llywood may retain records required for security, fraud prevention, moderation, copyright/DMCA, legal compliance, billing/payment disputes, audit logs, backups, tax/accounting, safety investigations, and lawful preservation. Premium or store-managed subscriptions may also need to be managed through Google Play.
```

## Data Safety

Use `docs/GOOGLE_PLAY_DATA_SAFETY_WORKSHEET.md` as the current worksheet. It is ready for owner/legal/provider review, not ready to paste blindly.

Do not answer "No data collected." Chi'llywood has accounts, UGC, profile/platform data, media uploads, chat, reports/moderation, camera/mic/live features, analytics/diagnostics packages, notifications, and conditional purchase/provider records.

Owner must verify before submission:

- Firebase Analytics/Crashlytics/Performance/Remote Config collection settings.
- RevenueCat/Google Play purchase-shell state for the submitted build.
- Whether search/app activity history is stored.
- Support/account deletion SLA and retention wording.
- Provider/service-provider sharing disclosures.
- Whether push tokens/device identifiers are collected in the submitted build.

## Content Rating

Content rating is not repo-completable; it is a Play Console questionnaire.

Prepared posture:

- User-generated content: yes.
- User interaction/chat/comments/live rooms: yes.
- Camera/mic/live participation: yes.
- Account creation/login: yes.
- Moderation/reporting/blocking: yes.
- Children/child-directed: no; launch posture is 18+.
- Gambling, drugs/alcohol/tobacco/firearms sales, real-money gambling: no app-feature evidence.
- Digital purchases: answer based on final submitted artifact/provider decision.
- Ads: answer no only if owner confirms no active ad SDK/ad delivery/paid placements.

Owner/legal must complete the Play Console/IARC questionnaire and save the result outside the repo.

## Target Audience / Age

Chi'llywood is 18+.

Current evidence:

- Signup has an 18+ confirmation checkbox.
- Signup has a separate Terms / Privacy / Community Guidelines acceptance checkbox.
- Legal policies state users must be at least 18.
- Store listing should not target children or claim Families participation.

Owner action:

- Select adult/general audience consistent with 18+ posture.
- Do not use child-directed screenshots, copy, or marketing assets.
- Review whether Play asks for Restrict Minor Access or equivalent controls based on selected categories.

## Ads Declaration

Current repo evidence supports "No ads active" only if the owner confirms the submitted build keeps ads disabled.

Evidence:

- No AdMob/AppLovin/Unity ad SDK dependency is installed.
- Ads foundation exists behind disabled config and placeholder provider.
- `ADS_LAUNCH_CONFIG_DEFAULTS.ads_enabled` is false.
- Runtime controls and Admin readouts do not create real ad delivery.

Owner action:

- Confirm no active ad SDK, no ad delivery, no paid placements, and no Advertising ID permission in the final Play artifact before answering "No ads."
- If real ads are added later, update Data Safety, Ads declaration, store copy, and proof.

## Payments / Subscriptions / In-App Products

Current truth:

- Android digital purchases use Google Play / RevenueCat.
- Stripe is not used for Android digital goods.
- Creator money remains sandbox/off for Android-first launch unless separately approved.
- Live money is off.
- Payouts/cash-out/withdrawal/transfer are off.
- Refund/credit/payout-hold foundation is remote-applied but does not execute refunds, create spendable credits, or release payouts.
- Premium is app-wide Chi'llywood Premium, not creator income.

Store-review-safe wording:

```text
Chi'llywood Premium is an app-wide subscription managed through Google Play and RevenueCat when enabled for the submitted test/release scope. Creator monetization and payout infrastructure are not live public cash-out systems in the current Android-first launch posture. Live money, creator payouts, withdrawals, transfers, and payable creator balances remain off unless a future approved rollout changes that status.
```

If paid public launch is included, owner must confirm:

- Google Play products/base plans are active.
- RevenueCat offerings/entitlements match uploaded package/runtime.
- Licensed tester path works for review.
- Data Safety includes purchase history/provider identifiers.
- Store listing and reviewer instructions do not overclaim creator payouts.

## Store Listing Draft

Short description:

```text
Upload, watch together, go live, and build your creator Platform.
```

Full description draft:

```text
Chi'llywood is a premium social streaming app for adult viewers and creators. Watch, discover creator Platforms, join social viewing experiences, message through Chi'lly Chat, and build a creator presence with Profile and Platform tools.

Explore public videos and creator surfaces, open Player experiences, connect with your Chi'lly Circle, and use report/support/legal paths when something needs review. Premium features are app-wide and separate from creator-specific offers.

Chi'llywood is 18+. Public V1 keeps live money and creator payouts off unless a future approved rollout changes that status. Creator monetization surfaces may show sandbox/readiness states and must not be treated as cash-out, withdrawal, or payable-balance tools.
```

Feature bullets:

- Premium social streaming identity.
- Public Profiles and creator Platforms.
- Watch-Party Live and Live Watch-Party surfaces where entitled.
- Chi'lly Chat messaging and call-route support.
- Settings, support, report, privacy, account deletion, and legal surfaces.
- Creator Studio/Platform Studio tools where eligible.

Checklist:

- Privacy URL: `https://chillywoodstream.com/privacy`
- Terms URL: `https://chillywoodstream.com/terms`
- Account deletion URL: `https://chillywoodstream.com/account-deletion`
- Support URL/contact: `https://chillywoodstream.com/support` / `support@chillywoodstream.com`
- Copyright/DMCA URL: `https://chillywoodstream.com/copyright-report`
- Suggested category: Entertainment or Social; owner must choose.
- Contact email: `support@chillywoodstream.com`
- 18+ positioning: adult/general audience, not children.

Do not claim:

- iOS support.
- BrowserStack proof.
- Live creator cash-out or payouts.
- Public live creator economy if creator money remains sandbox/off.
- Paid provider refunds/credits execution.

## Permissions / Sensitive Access

| Permission/capability | Evidence | User-facing purpose | Play/Data Safety note |
| --- | --- | --- | --- |
| Camera | `app.json`, Android manifest, LiveKit/camera routes | Live/video rooms, calls, Watch-Party/Live participation | Declare camera/video participation where asked. |
| Microphone | `app.json`, Android manifest | Speaking in rooms/calls | Declare microphone/audio participation where asked. |
| Notifications | `app.json`, Android manifest | Push/room/account reminders where enabled | Declare push/device token collection if enabled. |
| Network/Internet | Android manifest | App APIs, Supabase, LiveKit, media, legal pages | Normal app functionality. |
| Modify audio settings | `app.json`, Android manifest | RTC/audio route behavior | Explain as audio/call/live support if surfaced. |
| Read/write external storage | Generated native manifest includes legacy storage permissions beyond `app.json`. | Media/file selection/upload compatibility | Owner must confirm final Android artifact permission list and Play declarations. If not needed in target SDK behavior, consider future native cleanup lane. |
| System alert window | Debug manifests and generated main manifest show it. | Usually dev/debug overlay; needs final artifact review | Owner must confirm whether production Play artifact declares it. If present, Play Console sensitive permission review may be needed. |
| Wake lock/vibrate/access network state/Bluetooth | Generated native manifest | RTC/media reliability, haptics, network/audio support | Declare only where Play asks; verify final manifest from release AAB. |

## Android Readiness Decision Table

| Area | Status | Evidence | Owner action | Code needed? |
| --- | --- | --- | --- | --- |
| Package/build identity | Needs release artifact confirmation | `app.json`, `eas.json`, Android manifest | Confirm final Play artifact, versionCode, signing, installer. | No current app-code need |
| App access | Needs Play Console owner action | `docs/GOOGLE_PLAY_APP_ACCESS_DRAFT.md`, existing non-admin reviewer account docs | Enter/update credentials only in Play Console; verify account still works. | No |
| Privacy policy | Needs legal/owner acceptance | Legal source and public URL docs | Confirm URL, approve policy, enter in Play Console. | No |
| Account deletion | Needs Play Console/legal acceptance | In-app settings path and public URL docs | Save URL/data deletion answers; approve deletion SLA. | No |
| Data Safety | Needs owner/provider verification | New worksheet and existing evidence map | Complete Play form honestly; verify SDK/provider state. | No |
| Content rating | Needs Play Console owner/legal action | Prep sheet | Complete IARC questionnaire. | No |
| Target audience/age | Needs owner/legal action | 18+ signup/legal state | Select adult/general, not children. | No |
| Ads declaration | Needs owner confirmation | No active ad SDK found; disabled placeholder foundation | Confirm submitted build has no active ads. | No |
| Payments/subscriptions | Needs provider decision | RevenueCat/Google proof docs; money proof closed app-side | Decide if paid public launch is included; otherwise keep creator money sandbox/off. | No current app-code need |
| Store listing | Needs owner review | Existing store checklist and draft copy | Verify listing assets/copy/screenshots/contact email. | No |
| Permissions | Needs final artifact review | `app.json` + generated manifest | Confirm final AAB permissions in Play Console. | Future native cleanup only if Play flags a permission |
| Final Android smoke | Needs proof | Current OTA and Play-installed proof history | Install final Play candidate and smoke core routes/legal/signup/money-off posture/upload-to-playback. | No unless smoke finds bug |

## Deferred / Not Android-First Blockers

- BrowserStack/App Live regression: deferred until iOS integration is ready.
- iOS readiness: deferred.
- Watch-Party shared Player remote render: deferred unless owner declares it Android launch-critical.
- Attachment-heavy comments proof: pending only if launch-critical.

## True Android-First Blockers

1. Google Play Console App content readiness and acceptance.
2. Data Safety owner/legal/provider verification and acceptance.
3. Account deletion URL/path acceptance and deletion operations ownership.
4. Content rating and target audience completion.
5. Store listing/support/privacy/contact readiness.
6. Provider dashboard signoff and monitoring/rollback readiness.
7. Final Play-installed Android smoke.
8. Fresh creator upload-to-playback proof.
9. RevenueCat/Google Play production billing governance if paid public launch includes Premium or creator digital purchases.

## Sources Checked

- Google Play Console Help: Prepare your app for review.
- Google Play Console Help: Provide information for Google Play's Data safety section.
- Google Play Console Help: Understanding app account deletion requirements.
- Google Play Console Help: Content rating requirements.
- Google Play Console Help: Manage target audience and app content settings.

These official sources reinforce the repo conclusion: the remaining work is mostly Play Console/App content owner action and honest data/account/legal declarations, not app-code changes.
