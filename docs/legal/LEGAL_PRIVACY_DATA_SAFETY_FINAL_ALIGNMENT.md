# Legal/privacy/Data Safety Final Alignment

Status: Legal/privacy/Data Safety final alignment: Closed for repo-side documentation alignment; owner/legal review and Play Console acceptance remain external.

This is product/legal-readiness documentation alignment, not attorney legal advice. It records current app behavior, public legal surfaces, store-readiness evidence, and remaining owner/legal actions. It does not change Google Play products, RevenueCat mappings, Premium activation, creator-money switches, payouts, Stripe, merch, account deletion enforcement, moderation enforcement, staff roles, RLS, auth, LiveKit, scan gates, abuse throttles, or provider dashboards.

Required alignment assertions:

- Privacy Policy matches account, chat, media, analytics, crash, purchase, moderation, notification, and live room behavior.
- No secrets, raw storage paths, signed URLs, raw IPs, tokens, push tokens, provider secrets, tax IDs, bank details, proof passwords, private provider IDs, or private dashboard data are exposed.
- No money/provider/payout behavior changed.

Official Google Play references rechecked on June 25, 2026:

- Google Play Data Safety: https://support.google.com/googleplay/android-developer/answer/10787469
- Google Play account deletion requirements: https://support.google.com/googleplay/android-developer/answer/13327111
- Google Play user-generated content policy: https://support.google.com/googleplay/android-developer/answer/9876937

## Legal Surface Inventory

| Surface | Exists? | Public URL/path | App link/path | Owner/status | Stale/internal wording? | Matches current app behavior? | Action needed |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Terms | Yes | `public-site/legal-site/site/terms/index.html`; `https://chillywoodstream.com/terms` | Settings > Legal and Support; `/terms` | Draft pending attorney review | No public proof/debug/internal wording found | Yes, with UGC, moderation, Premium, and feature-availability boundaries | Attorney/legal approval and Play/store final acceptance |
| Privacy Policy | Yes | `public-site/legal-site/site/privacy/index.html`; `https://chillywoodstream.com/privacy` | Settings > Legal and Support; `/privacy` | Draft pending attorney review | No public proof/debug/internal wording found | Yes, covers account, chat, media, analytics, crash, purchase, moderation, notification, and live room behavior | Owner/legal confirms SDK/provider collection settings before Play submission |
| DMCA/copyright | Yes | `public-site/legal-site/site/copyright/index.html`; `public-site/legal-site/site/copyright-report/index.html`; `https://chillywoodstream.com/copyright-report` | Settings copyright policy and copyright report flow | Draft pending attorney/legal ops review | Fixed public "Designated Agent Placeholder" heading to production wording | Yes, DMCA/legal remains separate from ordinary moderation and evidence is private/scoped | Keep designated agent details current |
| Support | Yes | `public-site/legal-site/site/support/index.html`; `https://chillywoodstream.com/support` | Settings support/contact support | Manual support ops pending staffing/SLA | No public proof/debug/internal wording found | Yes, support is manual/escalation, not a separate staff role | Assign support owner/SLA |
| Account Deletion | Yes | `public-site/legal-site/site/account-deletion/index.html`; `https://chillywoodstream.com/account-deletion` | Settings > Account actions > Delete Account / Restore Account / Read Deletion Policy | Repo-backed scheduling; external Play acceptance pending | No hard-delete overclaim found | Yes, account deletion uses scheduled deletion, restore window where supported, and controlled purge/de-identification | Owner/legal confirms SLA and retention language |
| Refund/Digital Access | Yes | `public-site/legal-site/site/refunds/index.html`; source maps to Premium terms | Settings Premium/legal surfaces | Manual/external provider support | No automatic refund claim found | Yes, provider refunds remain manual/external | Owner/support confirms final refund support process before public claims |
| Premium Terms | Yes | `public-site/legal-site/site/premium-terms/index.html` | `/premium-terms`, Settings Premium | Draft pending attorney review | No annual-live claim found | Yes, Premium monthly proof exists, Premium annual remains provider-blocked until Google Play base plan exists | Keep annual out of live claims until provider path exists |
| Live Rules | Yes | `public-site/legal-site/site/live-rules/index.html` | `/live-rules` and creator/studio/legal links | Draft pending attorney review | No LiveKit token/raw URL exposure found | Yes, LiveKit token issuer remains source of truth; no call/live recording claim added | Keep aligned with live-room incident response doc |
| Community/Reporting/Moderation | Yes | `community-guidelines`, `moderation-policy`, `moderation` pages | Settings and Studio links | Draft pending attorney review | No full in-app appeal-center claim found | Yes, reports do not auto-delete, auto-ban, auto-suspend, or expose reporter identity; appeals use support/escalation workflow in V1 | Attorney/content-policy approval |
| Creator/Paid Content policy | Yes | `creator-monetization`, `sponsor-disclosure`, Premium/refunds pages | Creator Studio/Monetization legal links | Future-safe, money off | No creator-money-live claim found | Yes, creator-money remains OFF and no payouts/Stripe Connect/merch checkout/payable balances are live | Re-review before any money/provider activation |
| Data Safety evidence | Yes | `docs/google-play/DATA_SAFETY_EVIDENCE_MAP.md` | N/A | Prepared, not Play-submitted here | Internal proof notes are docs-only, not public legal pages | Yes, says the app collects account/media/chat/analytics/crash/payment/moderation/notification/live data where applicable | Owner completes Play form with final SDK/provider truth |
| Play reviewer packet | Yes | `docs/google-play/PLAY_REVIEWER_TEST_ACCOUNT_PACKET.md` | N/A | Field-ready; password not committed | Contains safe non-secret account email and explicit no-password rule | Yes, account deletion/support/legal links and Premium/money-off posture align | Owner enters credentials only in Play Console |
| In-app settings links | Yes | `app/settings.tsx` | Settings > Legal and Support / Account actions | Production linked | No proof/debug/internal role wording in user-facing legal labels found | Yes, app links Terms, Privacy, Support, Copyright, Account Deletion, Community, Moderation, Premium | Recapture smoke only if release UI changes |
| Public legal site | Yes | `public-site/legal-site/site/` | External URLs preferred by runtime config | Built from `legal/policies.mjs` | Placeholder heading fixed; no raw IDs/secrets exposed | Yes, public pages avoid proof/debug/internal wording | Rebuild and redeploy after legal approval |

## Account Deletion Alignment

| Topic | Current aligned behavior | Public/app claim to keep | Claims to avoid |
| --- | --- | --- | --- |
| In-app path | Settings exposes Delete Account, Restore Account during restore window, and Read Deletion Policy. | Users can schedule account deletion in the app while signed in. | Do not claim account deletion can be completed without identifying the account. |
| Web path | Public account deletion page exists and can describe request/support process without login. | The public page gives account deletion instructions and support contact. | Do not require re-installing the app to read deletion instructions. |
| Scheduled deletion | Deletion is scheduled and has a restore window where supported. | Account deletion uses scheduled deletion, restore window where supported, and controlled purge/de-identification. | Do not claim instant permanent hard deletion. |
| Restore/cancel | Restore is available during the window where supported. | Users can restore during the restore window according to app policy. | Do not promise restore after the deadline or after controlled purge/de-identification. |
| Purge/de-identification | Separate owner/operator-controlled policy after eligibility and retention checks. | Purge/de-identification remains a separate owner-controlled policy. | Do not merge purge/de-identification into normal suspension or support action. |
| Retention exceptions | Legal/security/payment/support/moderation evidence retention exceptions are preserved. | Legal/security/payment/support/moderation evidence retention exceptions are preserved. | Do not claim deletion removes audit, DMCA, legal, payment, fraud, security, support, or moderation evidence that must be retained. |
| Restricted accounts | Restricted/suspended/deleted users fail closed for private features where backed. | Restricted app access can be denied even if provider entitlements remain. | Do not claim provider-side entitlement cancellation or refund. |
| Provider purchases | Premium/provider records may remain provider-side. | Premium entitlement may remain provider-side, but app access fails closed for restricted users. | Do not claim account deletion automatically cancels Google Play/RevenueCat subscriptions. |

## Privacy / Data Safety Matrix

| Data area | App behavior | Data Safety posture | Privacy alignment |
| --- | --- | --- | --- |
| Account/profile | Supabase Auth and profile/platform data are used for account features and public identity where users publish. | Collected; service-provider processed; public only where product visibility allows. | Privacy Policy matches account/profile/platform behavior. |
| Chat/messages | Chi'lly Chat stores messages and thread context for participants; staff evidence access is exact-scope and case/report-context only. | Other in-app messages collected; shared with service providers and participants as designed. | Privacy Policy matches chat and moderation behavior; no arbitrary staff browsing claim. |
| Media/uploads/files | User-selected media/uploads are stored and scan/status gated where backed. | Photos/videos/files collected when uploaded; public only when published and allowed. | Privacy Policy matches media/upload and scan-gate behavior. |
| Analytics | Firebase Analytics helpers/packages exist; final collection state requires owner confirmation for submitted build. | Declare if enabled; do not answer "no data collected." | Privacy/Data Safety docs keep owner confirmation requirement. |
| Crash/performance | Firebase Crashlytics/Performance packages exist; final collection state requires owner confirmation. | Declare diagnostics/crash/performance if enabled. | Privacy Policy includes diagnostics and reliability data. |
| Purchases/Premium | Google Play/RevenueCat purchase history and entitlement state apply where Premium/reviewer sandbox path is enabled. | Purchase history/customer identifiers are in scope when purchase/restore is exposed. | Premium monthly proof exists; Premium annual remains provider-blocked until Google Play base plan exists. |
| Moderation/reports | Reports, evidence, audit rows, case context, support notes, DMCA/legal records are collected for safety/legal/support. | Support/safety/user-generated content and app activity are in scope. | Reports do not auto-delete, auto-ban, or expose reporter identity. |
| Notifications | Push tokens/device notification state are used where notifications are enabled. | Device IDs/tokens and notification delivery metadata may be collected/shared with service providers. | Push token values are not exposed in public docs/UI. |
| Live rooms/calls | LiveKit/token-authorized live participation and room/call metadata are used; no call recording introduced. | Camera/microphone/live participation is conditional when users join. | Privacy/Live Rules match live room behavior and do not claim retained call audio/video. |
| Security context | Security/network context is masked/summarized where exposed; raw IP is not public UI. | Approximate/IP/security provider data may be in scope through providers/security logs. | No raw IP exposure claim added. |
| Direct financial/card/tax/bank | No direct app collection for provider card/bank/tax data in current public scope. | Google Play/RevenueCat handle purchases; Stripe/merch/payout not live. | No tax IDs, bank details, provider secrets, or private provider IDs exposed. |

## Provider / Data Processor Matrix

| Provider | Current scope | Data categories | Alignment note |
| --- | --- | --- | --- |
| Supabase | Auth, database, storage, Edge Functions, reports, support/moderation/legal records | Account, profile, UGC, chat, reports, evidence metadata, auth/session/support data | Treat as service provider; preserve RLS/auth/privacy claims. |
| Firebase / Google | Analytics, Crashlytics, Performance, Remote Config, FCM where enabled | Analytics/app activity, crash logs, diagnostics, device/app IDs, push delivery | Owner must confirm collection settings for submitted build. |
| RevenueCat | Premium/subscription entitlement where purchase/restore is exposed | Customer identifiers, entitlement state, purchase history | Premium annual remains provider-blocked until Google Play base plan exists. |
| Google Play Billing | Android digital purchase rail | Purchase/subscription history and store-managed cancellation/refund records | Do not claim automatic refunds or cancellation from the app. |
| LiveKit | Live rooms, Watch-Party Live, calls/communication media | Room identity, token-authorized participation, real-time media | LiveKit token issuer remains source of truth; no recording added. |
| Expo Notifications / FCM | Push/ring notifications where user grants permission | Push tokens, notification delivery metadata | Tokens stay private; call/ring spam controls remain aligned. |
| Cloudflare / public legal hosting | Public legal site and support email routing/DNS | Public web requests and support email routing context | Public pages avoid private dashboard/provider data. |
| ClamAV scanner worker | Malware scanning for upload/evidence paths | Uploaded object bytes and scan metadata server-side | Security scanning remains fail-closed and does not weaken public visibility gates. |
| Stripe | Sandbox physical merch/payout readiness only | No production public app user card/tax/bank collection in this lane | No payouts, Stripe Connect, merch checkout, payable balances, or money movement are live. |

## Terms / Moderation / Live Rules Alignment

- Terms and Community/Moderation docs match the closed reporting/takedown/account restriction lanes: reports do not auto-delete, auto-ban, auto-suspend, or expose reporter identity.
- Takedowns require exact scope, reason, case/report context where applicable, audit, and evidence preservation.
- Appeals use support/escalation workflow in V1 unless a later lane implements a full in-app appeal center.
- Live Rules match the live-room moderation lane: host/authorized seat approval remains separate from staff moderation, LiveKit token issuer remains source of truth, blocked/disabled/deleted/scheduled-deletion/suspended users fail closed where backed, and urgent live safety routes to live-safety escalation.
- Staff/admin/moderation privacy disclosure matches real scoped access: private evidence access requires exact scope and case/report/support/legal context; no arbitrary private-chat, private-room, provider-secret, raw IP, raw token, signed URL, or raw storage browsing is claimed.

## Premium / Paid Access / Refund Alignment

- Premium monthly proof exists in repo history, but production/public Premium activation remains owner/provider gated.
- Premium annual remains provider-blocked until Google Play base plan exists.
- Creator-money remains OFF.
- Five/six creator-money sandbox product classes are proof/readiness only, not live public products.
- Provider refunds remain manual/external.
- Takedown/account restriction preserves payment/access history.
- No automatic refunds, payout approval, payout execution, cash-out, withdrawal, transfer, payable balances, Stripe Connect production onboarding, merch checkout, or money movement are live.
- Public Premium/paid-access/refund copy must stay future-safe and must not promise annual plans, automatic refunds, public paid creator content, public tickets/seats/tips/event passes, or payout earnings.

## Play Reviewer Alignment

- Play reviewer packet is aligned to non-admin reviewer access and says passwords must be entered only in Play Console.
- Reviewer path includes Settings > Legal and Support, Privacy, Terms, Account Deletion, Copyright/DMCA, Support, Community, Moderation, and Premium gating.
- Account deletion/support/legal links are available without exposing proof passwords or private credentials.
- Play reviewer packet does not include provider secrets, dashboard screenshots, signed URLs, raw storage paths, raw IPs, push tokens, LiveKit tokens, tax IDs, bank details, or private provider IDs.
- Data Safety evidence map matches actual app behavior at a repo level and still requires owner confirmation of final SDK/provider collection settings before Play submission.

## Public Legal Site Cleanup Summary

- Public legal pages exist for Terms, Privacy, Support, Account Deletion, Copyright, Copyright Report, Refunds, Premium Terms, Live Rules, Community Guidelines, Moderation Policy, and Creator Monetization.
- The public DMCA/copyright surface is `/copyright` and `/copyright-report`; there is no separate `/dmca` alias in the generated site.
- The public copyright policy heading was changed from placeholder wording to production wording.
- Public legal pages avoid proof/debug/internal wording.
- Public legal pages do not expose secrets, raw storage paths, signed URLs, raw IPs, tokens, push tokens, provider secrets, tax IDs, bank details, proof passwords, private provider IDs, or private dashboard data.

## Remaining Owner / Legal Review Items

- Attorney/legal review of Terms, Privacy, DMCA/copyright, Community/Moderation, Live Rules, Account Deletion, Premium/refund, support, retention, and Data Safety claims.
- Owner confirmation of Firebase Analytics, Crashlytics, Performance, Remote Config, FCM, RevenueCat, Google Play Billing, Supabase, LiveKit, Cloudflare/email, scanner, and any other provider disclosures for the submitted build.
- Play Console Data Safety, account deletion, content rating, App Access, store listing, and release-track acceptance.
- Support/account deletion/DMCA/moderation response owner and SLA.
- DKIM/outbound support/legal email verification if the owner wants automated notice/receipt claims beyond manual support email.

## Launch Status

Repo-side legal/privacy/Data Safety final alignment is closed for current documentation and public-copy consistency. External attorney/legal review, owner SDK/provider confirmation, Play Console submission/acceptance, support staffing/SLA, and public-site redeploy remain outside this repo lane.
