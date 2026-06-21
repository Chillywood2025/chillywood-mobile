# Chi'llywood Google Play Console Owner Action Closeout

Date: 2026-06-21
Status: Console-ready owner action packet; app behavior unchanged

This packet turns the Google Play readiness map into exact owner actions. It does not claim Google Play Console acceptance unless that state was directly readable. No app code, package id, runtime version, RevenueCat product, Google Play product, live-money switch, payout switch, RLS policy, or provider behavior changed.

## Direct Console / Provider Readback

| Area | Direct read/fill result | Notes |
| --- | --- | --- |
| Play Console UI App content forms | Not accessible from this environment | App access, Data Safety, account deletion, content rating, target audience, ads declaration, store listing, and contact forms must be verified by the owner in Play Console. |
| Android Publisher API | Read-only app-content status not available here | The available local tooling/service-account material can support Android Publisher work in other lanes, but App content questionnaire state is a Play Console owner action. No Play edit, upload, track mutation, or Console field mutation was made in this pass. |
| RevenueCat / Google Play production billing dashboards | Not accessed from this pass | Production Premium readiness remains owner/provider verification if paid public launch is included. Creator money production remains off. |
| Repo/package identity | Read from repo | `app.json` uses app name `Chi'llywood`, runtime `1.0.0`, and Android package `com.chillywood.mobile`. Local Gradle `versionCode 24` is stale relative to EAS/Play history and is not the release source of truth. |

## Play Console Owner Action Table

| Play Console area | Current status | Filled now? | Remaining owner action | Blocking? | Evidence |
| --- | --- | --- | --- | --- | --- |
| App access | Ready-to-paste instructions exist | No, owner must paste/save | Enter reviewer account email and password in Play Console only; verify account signs in on the uploaded artifact; keep admin routes private. | Yes | `docs/GOOGLE_PLAY_APP_ACCESS_DRAFT.md` |
| Ads declaration | Ready as "No ads" if owner confirms final artifact has no active ads | No | Confirm no active ad SDK, ad delivery, paid placements, or Advertising ID requirement in the uploaded artifact, then answer Ads accordingly. | Yes | No AdMob/AppLovin/Unity ad SDK dependency found; ads defaults remain off. |
| Content rating | Questionnaire prep ready | No | Complete IARC/Play questionnaire honestly for 18+ UGC, chat, live rooms, camera/mic, moderation/reporting, no gambling/firearm/drug sales. | Yes | `docs/GOOGLE_PLAY_READINESS_CLOSEOUT.md` |
| Target audience and content | 18+ posture ready | No | Select adult/general audience consistent with 18+ signup/legal posture; do not claim Families/child-directed status. | Yes | Signup has 18+ and legal acceptance; legal policies state 18+. |
| Data Safety | Worksheet ready, owner/legal/provider verify required | No | Fill Data Safety with account/profile, UGC/media, chat/messages, camera/mic/live, purchases where enabled, analytics/diagnostics, support/moderation, device identifiers where active. | Yes | `docs/GOOGLE_PLAY_DATA_SAFETY_WORKSHEET.md` |
| Account deletion | In-app and public web paths ready | No | Enter `https://chillywoodstream.com/account-deletion`, describe Settings > Account actions > Delete Account, 30-day restore, and retention exceptions. | Yes | `app/account-deletion.tsx`, legal policy bundle, readiness docs |
| Privacy policy | URL/content ready, legal approval still owner action | No | Enter/verify `https://chillywoodstream.com/privacy`; confirm legal/provider consistency with Data Safety. | Yes | `legal/policies.mjs`, `app/privacy.tsx` |
| Store listing | Draft copy/checklist ready | No | Enter final short/full description, screenshots, category, contact, privacy/support/legal URLs, and 18+ positioning. | Yes | Store listing draft below |
| Contact details | Ready values | No | Enter support contact email and verify inbox operations/SLA. | Yes | `support@chillywoodstream.com`; public support route |
| Release track status | Not Console-read in this pass | No | Confirm latest AAB/versionCode, testing track, countries/regions, rollout state, and release notes inside Play Console. | Yes | Repo history documents prior internal builds; current Console state must be owner-verified. |
| App signing / package identity | Package id ready; signing must be Play/EAS verified | No | Confirm uploaded artifact is `com.chillywood.mobile`, Play-managed/EAS-signed, versionName `1.0.0` or approved bump, and not a local debug artifact. | Yes | `app.json`; historical EAS/Play proof |
| Testing/release readiness | Android-first; BrowserStack deferred until iOS | No | Run final Play-installed Android smoke and fresh creator upload-to-playback proof after Console setup. | Yes | Current release doctrine |
| In-app products/subscriptions | App-side money proof closed; production billing governance still owner action | No | If paid public launch includes Premium, verify Google Play product/base plan, RevenueCat offering/entitlement, licensed tester path, store copy, and Data Safety. Keep creator money production off unless separately approved. | Blocking only if paid public launch includes Premium | Money proof/docs; provider status not read in this pass |

## App Access / Sign-In Details

Use this Play Console field set. Do not commit or paste the real password anywhere except Play Console or secure handoff.

```text
Chi'llywood can be opened without signing in for public browsing and legal/support surfaces. Account features require signing in.

Test account:
- Email: play-reviewer-app-access@chillywoodstream.com
- Password: [OWNER ENTERS PASSWORD IN PLAY CONSOLE ONLY]

Please do not use an owner/admin account for standard review. Admin, payout, live-money, provider, and private operator tools are gated and are not part of normal consumer review.

Suggested review path:
1. Launch the app.
2. Sign in with the reviewer account above.
3. Open Home, Explore, Live, and Library from bottom navigation.
4. Open Settings from the account/profile area.
5. Open Settings > Legal and Support to view Privacy Policy, Terms of Use, Community Guidelines, Account Deletion, Copyright/DMCA, Support, and Moderation Policy.
6. Open public Profile and Platform surfaces where visible.
7. Open a Player item from public or test content.
8. Use report/support entry points where visible.

Purchases/live money:
- Live money, creator payouts, cash-out, withdrawal, transfers, and payable creator balances are off.
- Creator money production is not active for normal public review unless Chi'llywood separately provides a licensed tester path.
- Premium is app-wide Chi'llywood Premium through Google Play/RevenueCat when enabled for the submitted test scope.
- Creator subscriptions, VIP, tips, tickets, event passes, and paid videos are separate from Premium and must not be treated as creator cash-out or payout systems.

Private/admin surfaces:
- Admin Command Center and owner/operator tools are private and not required for standard consumer review unless Chi'llywood provides a separate admin review packet.
```

## Data Safety Ready Answers

Use `docs/GOOGLE_PLAY_DATA_SAFETY_WORKSHEET.md` as the working sheet. Owner/legal/provider review is required before submission because the answer must match the exact uploaded artifact and provider dashboard state.

Minimum categories to include or owner-verify:

- Account/profile identity: display name, username, avatar/profile/platform fields.
- Email and account ids: Supabase Auth and app ids.
- User-generated media: uploads, thumbnails, profile/platform media, creator videos.
- Chat/messages/comments/reports: Chi'lly Chat, comments, room communication, support/moderation reports.
- Camera/mic/live: optional permission-based live/call/room transport through approved surfaces.
- Purchase history/provider identifiers: include if Premium or purchase/restore is enabled for the submitted artifact.
- Analytics/diagnostics/device identifiers: owner-verify Firebase/Google/RevenueCat/Expo/FCM collection state.
- Support communications and moderation/safety records.
- Approximate IP/security context through providers, where applicable.

Do not answer "No data collected." Do not claim no sharing if Supabase, Firebase/Google, RevenueCat/Google Play, LiveKit, Expo/FCM, or support providers receive data as processors/service providers.

## Account Deletion Console Answer

```text
Chi'llywood users can request deletion in the app from Settings > Account actions > Delete Account. The in-app flow schedules account deletion and provides a 30-day restore window.

Users can also review the public deletion instructions at:
https://chillywoodstream.com/account-deletion

The request covers account profile identity and account-linked app data where legally and technically permitted. Chi'llywood may retain records required for security, fraud prevention, moderation, copyright/DMCA, legal compliance, billing/payment disputes, audit logs, backups, tax/accounting, safety investigations, and lawful preservation. Premium or store-managed subscriptions may also need to be managed through Google Play.
```

## Content Rating Prep

Use these positions for the Play Console questionnaire unless owner/legal changes the launch posture:

- User-generated content: Yes.
- Chat/messaging/comments/live interaction: Yes.
- Camera/microphone/live participation: Yes.
- Moderation/reporting/blocking: Yes.
- App account/login: Yes.
- Intended audience: adults/18+.
- Directed to children/Families: No.
- Real-money gambling: No feature evidence.
- Gambling simulation: No feature evidence.
- Alcohol/tobacco/drug/firearm/explosive sales: No feature evidence.
- Explicit adult-sex product sales: No feature evidence.
- Digital purchases: answer based on final submitted artifact; Premium only if production Premium is enabled for review.
- Ads: answer no only if owner confirms no active ad SDK/ad delivery/paid placements in the submitted artifact.

## Target Audience / Age

Chi'llywood should be submitted as adult/18+ and not child-directed:

- Signup requires 18+ confirmation.
- Signup requires Terms, Privacy Policy, and Community Guidelines acceptance.
- Store screenshots/copy should not market to children.
- Do not opt into Families unless the product direction changes and legal/product controls are rebuilt for minors.

## Ads Declaration

Current repo evidence supports "No, this app does not contain ads" for the Android-first launch if the owner confirms the final artifact has no active ad delivery:

- No active AdMob/AppLovin/Unity ad SDK dependency was found.
- Ads defaults remain off.
- No live ad placements were enabled by this pass.

If ads or paid placements are enabled later, update Ads declaration, Data Safety, store listing, legal copy, and installed-device proof.

## Store Listing Draft

Short description:

```text
Upload, watch together, go live, and build your creator Platform.
```

Full description:

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

Owner must provide/check:

- Final screenshots from the current Play-installed release candidate.
- Category: likely Entertainment or Social; owner choice required.
- Support/contact email: `support@chillywoodstream.com`.
- Privacy Policy URL: `https://chillywoodstream.com/privacy`.
- Terms URL: `https://chillywoodstream.com/terms`.
- Account deletion URL: `https://chillywoodstream.com/account-deletion`.
- Support URL: `https://chillywoodstream.com/support`.
- Copyright/DMCA URL: `https://chillywoodstream.com/copyright-report`.

Do not claim iOS, BrowserStack proof, live creator cash-out, public creator payouts, public live creator economy, provider refund execution, or spendable credits.

## Payments / Subscriptions

Current Play-safe payment posture:

- Android digital goods use Google Play / RevenueCat.
- Stripe is not Android digital checkout.
- Premium is app-wide Chi'llywood Premium and not creator income.
- Creator money production is off for Android-first unless separately approved.
- Live money, payouts, withdrawal, cash-out, transfers, payable creator balances, spendable credits, and provider refund execution are off.

Premium production readiness is not complete from this pass because provider dashboard status was not directly verified. If Premium is included in the public paid launch, owner must verify:

- Google Play subscription/product/base plan status.
- RevenueCat product/offering/entitlement status.
- Licensed tester/reviewer purchase path.
- Restore wording and behavior on final artifact.
- Data Safety purchase-history disclosures.
- Store listing subscription copy.

## Release Track / Build Requirement

No new AAB is required by this owner-action docs pass and no native/config change was made here.

Decision for public release:

- OTA is enough only for compatible installed testers receiving JS/UI updates.
- A final public submission should use a traceable Play-installed AAB/release candidate unless the owner explicitly accepts OTA-on-current-artifact risk.
- Owner must confirm Play Console track, versionCode, release notes, countries/regions, rollout percentage, signing, and artifact status.
- Final Play-installed Android smoke and fresh creator upload-to-playback proof should run after the exact release candidate is installed.

## Fastest Safe Android-First Path

1. Keep live money, payouts, creator money production, spendable credits, and provider refund execution off.
2. Fill and save Play Console App content: App access, Data Safety, account deletion, content rating, target audience, ads, privacy policy, store listing/contact details.
3. Verify provider dashboards: Supabase, Firebase, LiveKit/TURN, email/SMTP, legal/support site, RevenueCat/Google Play only if Premium paid public launch is included.
4. Upload or select the final traceable Android release candidate.
5. Run Play-installed Android smoke on that artifact.
6. Run fresh creator upload-to-playback proof.
7. Confirm monitoring/rollback/support readiness.
8. Make Android release go/no-go.

BrowserStack/App Live waits until iOS integration is ready unless the owner explicitly changes that decision.

## Safety Confirmation

- No product behavior changed.
- No auth/RLS/admin behavior changed.
- No package id/runtimeVersion changed.
- No native build was created.
- No Play edit, track mutation, or Console form mutation was performed.
- No RevenueCat/Google Play product was changed.
- No live money, payouts, creator money production, spendable credits, provider refunds, provider transfers, or payable balances were enabled or created.
- No secrets, passwords, service-account JSON, API keys, provider credentials, or `supabase/.temp/` contents are documented here.
