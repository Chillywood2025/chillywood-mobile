# Chi'llywood Google Play Console Owner Action Closeout

Date: 2026-06-21
Status: Console owner-action closeout; closed-testing package sent for review; app behavior unchanged

This packet turns the Google Play readiness map into exact owner actions and records the direct Play Console work completed through Chrome. It does not claim production approval or public-launch readiness. No app code, package id, runtime version, RevenueCat product, Google Play product, live-money switch, payout switch, RLS policy, or provider behavior changed.

## Direct Console / Provider Readback

| Area | Direct read/fill result | Notes |
| --- | --- | --- |
| Play Console app identity | Read directly | App name `Chi'llywood`, package `com.chillywood.mobile`, app status Draft, current track/status Internal testing, developer account `6817909936082971994`, app id `4973081175226507322`. |
| App content overview | Read directly | Need-attention tab showed `You're all caught up`; Actioned tab showed 10 actioned declarations: Sign in details, Data safety, Content ratings, Target audience and content, Financial features, Health apps, Government apps, Advertising ID, Ads, and Privacy policy. |
| App access/sign-in details | Read directly | Restricted app set to Yes and a Standard reviewer account is present. The reviewer password was not opened, printed, copied, or documented. |
| Store listing | Read directly | Default store listing showed `Ready to send for review`, app name `Chi'llywood`, current short/full descriptions, icon/feature graphic, and 4 phone / 4 seven-inch tablet / 4 ten-inch tablet screenshots. |
| Closed testing Alpha | Mutated in Console | Added United States, selected `Chi'llywood Internal Testers` email list with 17 users, set feedback email `support@chillywoodstream.com`, discarded stale draft release versionCode 15, promoted internal testing versionCode 54 / `1.0.0` into Alpha, added release notes, saved the release, and sent 13 changes for review. |
| Publishing overview | Read directly after submission | Shows `Changes in review`, `13 changes sent for review`, and Google quick checks running before review proceeds. Managed publishing is off. |
| Production access | Read directly | Production is inactive and production access is blocked until closed testing has at least 12 opted-in testers for at least 14 days. |
| Play products/subscriptions | Read directly | Subscriptions listed `premium_subscription` and `channel_subscription_sandbox_monthly_499`, each with one active base plan. One-time products listed seven sandbox products with one active purchase option/offer each. |
| Latest artifact readback | Read directly | App bundle versionCode 54 / `1.0.0` is active in internal testing and was used for the Alpha draft. Target SDK 36, minimum API 24, Play signing/protection shown. |
| RevenueCat / Google Play production billing dashboards | Not accessed from this pass | Production Premium readiness remains owner/provider verification if paid public launch is included. Creator money production remains off. |
| Repo/package identity | Read from repo | `app.json` uses app name `Chi'llywood`, runtime `1.0.0`, and Android package `com.chillywood.mobile`. Local Gradle `versionCode 24` is stale relative to EAS/Play history and is not the release source of truth. |

## Play Console Owner Action Table

| Play Console area | Current status | Filled now? | Remaining owner action | Blocking? | Evidence |
| --- | --- | --- | --- | --- | --- |
| App access | Existing restricted-app reviewer account present | Verified/read; password not inspected | If Google asks, rotate/replace reviewer credential through secure owner-only channel; keep admin routes private. | Review-dependent | Play Console App access page |
| Ads declaration | Actioned declaration present | Already actioned before this pass | Revisit only if ads/ad SDKs are enabled later. | No current blocker | App content Actioned tab |
| Content rating | Actioned declaration present | Already actioned before this pass | Revisit only if Google flags it or product scope changes. | Review-dependent | App content Actioned tab |
| Target audience and content | Actioned declaration present; target age 18+ appeared in publishing change set | Already actioned before this pass | Keep store copy/screenshots adult-oriented and not child-directed. | Review-dependent | Publishing overview |
| Data Safety | Actioned declaration present | Already actioned before this pass | Respond to any Google review finding; owner/legal should keep provider disclosures current. | Review-dependent | App content Actioned tab |
| Account deletion | Privacy/deletion posture represented in app content/listing docs | Included in submitted package | Respond to any Google review finding; keep `https://chillywoodstream.com/account-deletion` live. | Review-dependent | Publishing overview / docs |
| Privacy policy | `https://chillywoodstream.com/privacy` in submitted change set | Submitted | Keep URL live and consistent with Data Safety. | Review-dependent | Publishing overview |
| Store listing | Default listing ready and submitted | Submitted | Respond to any store listing review finding. | Review-dependent | Store listing and Publishing overview |
| Contact details | Feedback email set to `support@chillywoodstream.com` for tester list | Filled for Alpha testers | Keep support inbox staffed. | No current blocker | Closed testing tester list |
| Release track status | Closed testing Alpha submitted with v54 / `1.0.0` | Submitted for review | Monitor quick checks/review; after approval, collect tester opt-ins and 14-day closed-test evidence. | Yes for production access | Publishing overview / Dashboard |
| App signing / package identity | Package `com.chillywood.mobile`; Play signing/protection shown on v54 release | Verified in Console | Keep using Play/EAS-signed artifacts; do not use local debug artifacts. | No current blocker | Alpha release page |
| Testing/release readiness | Android-first closed test review started; BrowserStack deferred until iOS | In progress | Wait for review/checks, run final Play-installed Android smoke and fresh creator upload-to-playback proof after tester artifact is live. | Yes before public release | Publishing overview / release doctrine |
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
- Admin Command Center and owner/Admin tools are private and not required for standard consumer review unless Chi'llywood provides a separate admin review packet. Backend `operator` remains only the internal Admin alias.
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

No new AAB was created by this owner-action pass and no native/config change was made here. Existing internal testing artifact versionCode 54 / `1.0.0` was promoted into Closed testing Alpha through Play Console.

Decision for public release:

- OTA is enough only for compatible installed testers receiving JS/UI updates.
- Closed testing Alpha now uses traceable app bundle versionCode 54 / `1.0.0`.
- Production access is still blocked until Google's closed-test requirement is met.
- Monitor quick checks and review result for the 13 submitted changes.
- Final Play-installed Android smoke and fresh creator upload-to-playback proof should run after the exact release candidate is installed.

## Fastest Safe Android-First Path

1. Keep live money, payouts, creator money production, spendable credits, and provider refund execution off.
2. Monitor Google quick checks and review for the submitted 13-change closed-testing package.
3. Get at least 12 testers opted into the closed test and keep the test running for at least 14 days.
4. Verify provider dashboards: Supabase, Firebase, LiveKit/TURN, email/SMTP, legal/support site, RevenueCat/Google Play only if Premium paid public launch is included.
5. Run Play-installed Android smoke on the approved tester artifact.
6. Run fresh creator upload-to-playback proof.
7. Confirm monitoring/rollback/support readiness.
8. Apply for/complete production access and make Android release go/no-go.

BrowserStack/App Live waits until iOS integration is ready unless the owner explicitly changes that decision.

## Safety Confirmation

- No product behavior changed.
- No auth/RLS/admin behavior changed.
- No package id/runtimeVersion changed.
- No native build was created.
- Play Console track/review mutations were limited to Closed testing Alpha setup and review submission for existing versionCode 54.
- No RevenueCat/Google Play product was changed.
- No live money, payouts, creator money production, spendable credits, provider refunds, provider transfers, or payable balances were enabled or created.
- No secrets, passwords, service-account JSON, API keys, provider credentials, or `supabase/.temp/` contents are documented here.
