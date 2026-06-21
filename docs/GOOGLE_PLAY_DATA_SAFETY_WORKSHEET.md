# Google Play Data Safety Worksheet

Date: 2026-06-21
Status: Owner/legal/provider verification required before Play submission

This worksheet is conservative. If a data category is uncertain, it is marked `Owner verify` rather than guessed. Do not answer "No data collected" for Chi'llywood.

## Data Categories

| Data category | Collected? | Shared? | Purpose | Required or optional | Encrypted in transit? | User can request deletion? | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Name/display name/username/profile identity | Yes | Public when user chooses public visibility; service providers | Account/profile/platform functionality, discovery, moderation | Basic account identity required; richer profile optional | Yes, expected via HTTPS/TLS | Yes, subject to retention exceptions | Includes display name, username, avatar/background/bio where set. |
| Email address | Yes | Supabase/auth/email service providers; legal/support where required | Authentication, account recovery, support, security | Required for account | Yes | Yes, subject to retention exceptions | Do not expose emails in public search. |
| User IDs/account IDs | Yes | Service providers; admin/legal where required | App functionality, RLS, support, moderation, analytics/diagnostics | Required | Yes | De-identification/deletion subject to retention | Includes Supabase auth id and app ids. |
| Photos/videos/uploads/media | Yes when uploaded/selected | Public only where user publishes and gates allow; storage/scanning/media providers | Profile media, creator uploads, playback, moderation, support/DMCA evidence | Optional | Yes | Yes where legally/technically permitted | Malware/moderation/visibility gates apply; owner verify scanner retention wording. |
| Messages/chat/content/comments | Yes if user uses those features | Thread/room participants; service providers; moderation/legal where required | Chi'lly Chat, comments, room communication, safety | Optional | Yes | Yes subject to recipient context and retention exceptions | Do not claim private messages are public. |
| Audio/video/camera/mic streams | Conditional when user grants permission and joins supported surfaces | LiveKit/room participants as authorized; service providers | Live rooms, Watch-Party Live, calls | Optional permission-based | Yes, expected via encrypted transport/provider | Account deletion/support request can cover related records; live media retention owner verify | Do not claim recording/retention unless a recording feature is enabled. |
| Purchase history / entitlement records | Conditional | Google Play/RevenueCat and app backend when purchase/restore is enabled | Premium/creator access, restore, fraud/support | Optional unless user purchases | Yes | Retention exceptions for accounting/fraud/legal | Include if Premium or sandbox/production purchases are exposed in submitted build. |
| App activity/playback/search/follows/likes/reports | Yes/conditional | Service providers; public only where user makes activity visible | App functionality, personalization, search/discovery, moderation/safety | Mixed | Yes | Yes subject to retention exceptions | Owner verify whether search history is persisted in submitted build. |
| Diagnostics/crash/performance | Owner verify | Firebase/Google if enabled | Crash reporting, reliability, performance | Generally optional/service quality | Yes | Provider/account deletion process where applicable | Firebase Analytics/Crashlytics/Performance packages are present; owner must confirm release collection state. |
| Analytics/app interactions | Owner verify | Firebase/Google if enabled | Product analytics, reliability, feature usage | Conditional | Yes | Provider/account deletion process where applicable | Do not claim absent until Firebase collection state is confirmed. |
| Device identifiers/push tokens | Conditional | Expo/Firebase/Google/RevenueCat/Supabase as service providers | Notifications, billing, diagnostics, security | Optional/conditional | Yes | Yes where backed | Include if notifications or SDK IDs are active. |
| Moderation/safety reports | Yes if submitted/reviewed | Authorized support/moderation/legal/service providers | Safety, rule enforcement, legal compliance | Optional unless user reports | Yes | May be retained for safety/legal/audit | Retention exceptions are important. |
| Support communications | Yes if user contacts support | Support operators/service providers/legal where required | Account help, deletion, billing support, legal/support | Optional | Yes where provider supports it | Yes subject to retention exceptions | Support email is `support@chillywoodstream.com`. |
| Approximate location/IP/security logs | Owner verify | Infrastructure/security providers | Security, fraud, abuse prevention, diagnostics | Conditional | Yes | Retention exceptions | No app location feature found, but providers may process IP/security context. |
| Contacts/address book | No repo feature evidence | No | Not used | Not applicable | Not applicable | Not applicable | Verify no SDK adds contacts collection. |
| Precise location, health, SMS/call logs | No repo feature evidence | No | Not used | Not applicable | Not applicable | Not applicable | Verify final manifest/SDK disclosures. |

## Provider / SDK Review

| Provider / SDK | Current role | Data Safety implication | Owner verification |
| --- | --- | --- | --- |
| Supabase | Auth, database, storage, Edge Functions, RLS-backed APIs | Account, UGC, media metadata, messages, reports, support/deletion records | Confirm retention/backups and deletion operations. |
| LiveKit | Live/call/media transport | Camera/mic streams, room participation identity | Confirm no recording unless separately enabled. |
| Firebase Analytics | Installed | Analytics/app activity/device identifiers if enabled | Confirm release collection state. |
| Firebase Crashlytics/Performance | Installed | Diagnostics/crash/performance/device/app info if enabled | Confirm release collection and retention. |
| Firebase Remote Config | Installed | App instance/config context if active | Confirm active use and data disclosure. |
| Expo Notifications / FCM | Installed/used where registered | Push token/device notification identifiers | Confirm rollout and deletion handling. |
| RevenueCat / Google Play Billing | Premium and sandbox money proof paths | Purchase history, entitlement/customer ids, provider identifiers when enabled | Confirm submitted build purchase-shell state and product/offering mapping. |
| Stripe / Stripe Connect | Foundation/readiness/test-mode only for physical merch/payout setup; not Android digital checkout | Do not declare active public card/shipping/KYC unless exposed in submitted build | Confirm no public live merch/payout onboarding in Android-first release. |
| Cloudflare/public legal site/support email | Legal pages and support routing | Support communications if used | Confirm inbox owner/SLA and outbound provider. |

## Security / Deletion Notes

- Data should be transmitted using HTTPS/TLS or provider-secure media transport.
- Account deletion is available in app and via public web instructions.
- Do not claim immediate permanent purge; current truth is scheduled deletion with 30-day restore window and retention exceptions.
- Retention exceptions include legal, security, fraud, moderation, copyright/DMCA, billing/payment disputes, audit logs, backups, tax/accounting, and lawful preservation.

## Owner Verify Before Submission

- Firebase collection settings.
- RevenueCat/Google purchase state for the submitted build.
- Whether purchase history is in scope for reviewer account.
- Support/account deletion SLA and staffing.
- Privacy-policy wording after final provider decisions.
- Whether final Play artifact includes any sensitive permission not represented in `app.json`.
