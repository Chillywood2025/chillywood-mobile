# Chi'llywood Public Legal Site

This folder owns the static public legal/support URL surface for launch readiness.

Canonical policy text now comes from `../../legal/policies.mjs`. The older markdown drafts in `docs/legal/` remain historical/supporting docs, but the mobile app, public static site, and Admin Canary legal readiness checks all use the shared policy module.

Public legal/support UI and intake forms inherit `../../docs/APP_UI_UX_RULES.md`: production forms, mobile-first spacing, real submit/loading/success/error states, honest disabled reasons, no admin-only exposure, no raw debug UI, and no fake proof.

Build:

```sh
npm run legal-site:build
```

Serve locally:

```sh
npm run legal-site:serve -- --port 4177
```

Deployable output:

```text
public-site/legal-site/site/
```

Password-reset and signup-confirmation browser fallbacks:

- `/reset-password` is a non-consuming handoff page. It makes no Auth requests and never launches an app on load. Android Chrome retains its trusted-click intent addressed to `com.chillywood.mobile`, with underlying canonical HTTPS data. No credential-bearing custom scheme or browser-fallback URL is used.
- Safari on iPhone/iPad uses two explicit gestures: the canonical page navigates to `https://chillywood-legal.pages.dev/auth-handoff` with only validated `token_hash` and `type` in the fragment. That origin scrubs immediately, then a trusted native anchor activation returns to the fixed canonical HTTPS route derived from type. The bridge rejects query strings, unknown/duplicate fields, foreign hosts and other credential families. It never redeems a token. The intermediate is deliberately NOT an associated domain: the final Safari gesture crosses origins, as described in [Apple's Universal Link guidance](https://developer.apple.com/documentation/xcode/allowing-apps-and-websites-to-link-to-your-content). A same-host path is not a workaround.
- The final anchor has only a token-free canonical href until a trusted, unmodified primary activation; it receives the full URL synchronously before native default navigation. Synthetic, repeated, modified, auxiliary and context-menu events are blocked. The retry timer restores the token-free href, never navigates. Pagehide, hidden visibility and persisted pageshow clear memory/href and fail closed; reopening the email is required. The page explains failed association without automatically looping. iOS in-app browsers and non-Safari clients are not supported by this handoff.
- Fragment transport excludes the credential from the intermediate HTTP request but DOES expose it to the intermediate origin's code and browser. It is not a zero-retention claim. The final native anchor/browser UI can access the URL during activation, and fallback HTTPS navigation may reach the canonical host. Both origins require explicit trust/publication review. No new domains, AASA entries, native entitlements, App Store releases, provider settings or Auth operations are part of this source change.
- The page accepts only a 56-character lowercase hexadecimal `token_hash`, optionally prefixed with literal `pkce_` (total length 61), and `type=recovery`. It preserves the prefix unchanged, scrubs the address with `history.replaceState` before enabling the action, and retains handoff data only in page memory until navigation. Refreshing or returning after `pagehide` requires reopening the original email. This does not claim to determine expiry or token validity.
- `/auth-callback` reuses this non-consuming handoff solely for the current confirm-signup template: the same bare/prefixed token-hash contract and `type=email`. It has distinct signup copy and rejects recovery, OAuth/code, session-token, invite, magic-link and email-change inputs. It does not create an account, verify a token, confirm an email, or accept terms. Both pages share the existing public site's palette without external assets or resources.
- Token-shape contract was checked against Supabase Auth's [GenerateTokenHash](https://github.com/supabase/auth/blob/master/internal/crypto/crypto.go) (SHA-224 lowercase hex), [PKCE prefixing](https://github.com/supabase/auth/blob/master/internal/api/pkce.go), and [template mailer](https://github.com/supabase/auth/blob/master/internal/mailer/templatemailer/templatemailer.go). The earlier local-only 64-hex candidate incorrectly rejected all four bare/prefixed reset/signup fixtures; the generated-page regression suite now covers those shapes and rejects 55/57/64 lengths, uppercase or repeated/unknown prefixes, encoded newline and delimiter injection. No live credentials were used.
- Canonical `_headers` must contain `resetPasswordHeaders`, `signupConfirmationHeaders`, and `iosHandoffHeaders` from `reset-password-page.mjs`; the build fails if script/style CSP hashes become stale. Generated headers remain byte-identical to canonical headers. The local `serve.mjs` does not apply Cloudflare `_headers`, so it is not hosting-header proof.
- Run `node --test tests/reset-password-landing.test.mjs tests/ios-auth-handoff.test.mjs` after the site build for generated-script DOM/event tests; the existing Product root test glob discovers both. `node scripts/test-reset-password-landing-browser.mjs` separately requires a working Chromium runtime and tests Android reset plus both iOS two-step paths with all page requests intercepted and synthetic links only. Its iOS cases test Chromium native-anchor URL capture with a Safari user agent, NOT actual Safari dispatch. The local attempt timed out during Chromium startup; no browser assertions executed. Neither harness establishes installed-app handoff, signing identity, domain verification, or email delivery.
- Publication is a separate deployment decision. The repository does not establish the current Cloudflare Pages Git integration or preview/production deployment settings. Check these before pushing this change. A source merge is not authorization to deploy or edit Auth templates/redirect settings.
- Deployment review must verify all six hosted path variants (`/reset-password`, `/reset-password/`, `/reset-password/index.html`, `/auth-callback`, `/auth-callback/`, `/auth-callback/index.html`) use no-store/no-referrer/CSP headers and contain no injected scripts/analytics. URL scrubbing cannot remove the initial request from browser or hosting infrastructure; separately verify hosting/access-log handling. Existing provider click-tracking and email-template policy are unchanged by these pages.
- Also verify `/auth-handoff`, `/auth-handoff/`, and `/auth-handoff/index.html` on the fixed Pages host, with direct 200/no redirects, no injected scripts/resources, and the same restrictive headers. The same artifact is hosted on both origins, but scripts reject the wrong origin for each role. `node --test tests/ios-auth-handoff.test.mjs` executes the generated scripts and models native default-anchor ordering; it is not real-browser or device proof. Manual Safari/iPhone testing must still establish that the real installed app receives both reset/signup HTTPS URLs, including cancellation/retry, missing association, stale tabs and iPad behavior. Do not claim this from Chromium or simulated events.
- All nine route variants detach `NEL` and `Report-To` using Cloudflare `_headers` removal syntax. Verify actual hosted responses after deployment; source rules are not proof of edge removal. Existing browser-cached NEL policies may persist. This does not emit `max_age: 0`, change whole-origin/account policies, or claim zero reporting/logging. Standards-compliant NEL strips fragments, but the canonical query URL may still be reportable under an existing policy. See [Cloudflare header removal](https://developers.cloudflare.com/pages/configuration/headers/) and [W3C NEL](https://www.w3.org/TR/network-error-logging/).

Android App Links association:

- Source template: `public-site/legal-site/assetlinks.json`
- Deployable output: `public-site/legal-site/site/.well-known/assetlinks.json`
- Hosted URL: `https://chillywoodstream.com/.well-known/assetlinks.json`
- The template contains the public Play App Signing SHA-256 fingerprint for package `com.chillywood.mobile`. Do not use debug, upload-key, local keystore, or guessed fingerprints for future package/domain associations.
- Android App Links closure for `chillywoodstream.com` passed on July 6, 2026: the hosted URL returns HTTPS 200 JSON, Play Console Deep links for Google Play internal versionCode `80` showed `All links working`, and Android 16 Play-installed device verification reported `chillywoodstream.com: verified`.
- Future App Links manifest changes require a new native Google Play Android build; OTA alone cannot close Play Console deep-link association warnings.

iOS Universal Links association:

- Canonical source: `public-site/legal-site/apple-app-site-association` (intentionally extensionless).
- Deployable output: `public-site/legal-site/site/.well-known/apple-app-site-association`.
- Hosted URL: `https://chillywoodstream.com/.well-known/apple-app-site-association`.
- Cloudflare Pages headers source: `public-site/legal-site/_headers`; the build copies it to `site/_headers` and sets the exact association path to `Content-Type: application/json`.
- Run `npm run legal-site:build` followed by `npm run guard:apple-app-site-association` before deployment. The guard requires Apple application identifier `CU7536UQK9.com.chillywood.mobile`, every approved auth/content route, scoped descendant matching only, byte-identical generated output, and no repository redirect rule for the association path.
- Repository readiness does not prove production hosting. Production proof still requires the exact hosted path to return HTTPS 200 directly, without a redirect, with `application/json`, and with the deployed body matching the canonical source.
- AASA or associated-domain entitlement changes require a new signed iOS build for installed-device verification; an OTA alone is not proof of Universal Links association.

Preferred production mapping after DNS/hosting setup:

- `https://chillywoodstream.com/terms`
- `https://chillywoodstream.com/privacy`
- `https://chillywoodstream.com/creator-rules`
- `https://chillywoodstream.com/community-guidelines`
- `https://chillywoodstream.com/copyright`
- `https://chillywoodstream.com/copyright-report`
- `https://chillywoodstream.com/account-deletion`
- `https://chillywoodstream.com/support`
- `https://chillywoodstream.com/premium-terms`
- `https://chillywoodstream.com/live-rules`
- `https://chillywoodstream.com/law-enforcement`
- `https://chillywoodstream.com/moderation-policy`
- `https://chillywoodstream.com/creator-monetization`

Current repo truth: this static site is deployed on `chillywoodstream.com` from repo source. The May 22, 2026 deployment uploaded the expanded generated output to Cloudflare Pages project `chillywood-legal`; apex proof returned HTTP 200 after redirect for `/copyright-report/`, and prior May 21 apex proof remains the governing baseline for `/privacy/`, `/creator-monetization/`, `/live-rules/`, `/terms`, `/account-deletion`, `/copyright`, and `/support` unless a later deployment regresses them. Support inbox receipt proof for `support@chillywoodstream.com` is closed, and public DNS proves Cloudflare MX, SPF `v=spf1 include:_spf.mx.cloudflare.net ~all`, and DMARC `v=DMARC1; p=none; rua=mailto:support@chillywoodstream.com; adkim=r; aspf=r; fo=1`. DKIM remains pending until a real outbound mail provider for `@chillywoodstream.com` issues selector records. Google Play web-link acceptance, attorney review, outbound email automation, and automated malware scanning remain external/pending until separately proved. DMCA designated-agent public contact posting and U.S. Copyright Office registration are recorded complete for registration `DMCA-1072720`; backed/Admin DMCA case management is production-closeout complete in the app/backend, including formal notice intake, public form intake, private evidence attachments with pending-manual-review scan status, uploader-facing counter-notice self-service for the affected uploader, case detail, content actions, strikes, counter-notice recording, functional case history, scoped RLS/RPC access, and production-hidden test/proof cases. Owner/Admin Legal Intake and Legal Evidence are also production-closeout complete in the app/backend: one top-level Legal tab contains Intake/Evidence/Holds/Requests/Exports/Timeline sections, legal request list/create/open/status/timeline/evidence linkage is backed, scoped Admin preview/export/hold access is enforced server-side, and owner normal Legal work does not require a reason prompt or owner-sensitive app-level audit unless Break Glass is active.

The May 21 policy bundle includes 12 full pages, each over 1,500 words: Privacy, Terms, Community Guidelines, Creator Rules, Copyright/DMCA, Support & Account Help, Account Deletion, Premium/Subscription Terms, Live/Watch-Party/Chat Rules, Law Enforcement/Legal Requests, Moderation/Appeals, and Creator Monetization/Revenue Disclaimer. `npm run legal-site:build` currently generates 18 static pages: the 12 policy pages, the formal `/copyright-report` public intake page, and compatibility aliases for existing launch/legal paths.

Cloudflare status as of July 6, 2026:

- Pages project: `chillywood-legal`
- Proved App Links Pages deployment: `https://54c2b916.chillywood-legal.pages.dev`
- Expanded generated output deployed successfully from `public-site/legal-site/site/`.
- Custom domain `chillywoodstream.com` is active.
- `https://chillywoodstream.com/` returns HTTP/2 200.
- `https://chillywoodstream.com/.well-known/assetlinks.json` returns HTTP/2 200 `application/json` with package `com.chillywood.mobile`, relation `delegate_permission/common.handle_all_urls`, and the public Play App Signing SHA-256 fingerprint.
- `/copyright-report` returned HTTP 200 after trailing-slash redirect in May 22 proof and hosts the public copyright notice form.
- `/privacy`, `/creator-monetization`, and `/live-rules` returned HTTP 200 after trailing-slash redirect in May 21 proof.
- `/terms`, `/account-deletion`, `/copyright`, and `/support` had prior HTTP 200 proof after trailing-slash redirect and remain current unless a later deploy regresses them.
- No LiveKit fallback was reached on legal/support paths.
- Admin Canary legal/DMCA readiness is backed by `admin-owner-controls` ACTIVE version 20 and `admin-legal-evidence` ACTIVE version 7. The May 22 physical Android owner-device release run on `R5CR120QCBF` returned `65 pass`, `0 manual_required`, and `0 failed` after the Legal Intake / Legal Evidence closeout checks were added.
- The public DMCA URL canary now passes through configured `PUBLIC_DMCA_URL=https://chillywoodstream.com/copyright-report`; the public form canary submits through anon `submit_dmca_notice`, uploads private DMCA evidence to `dmca-evidence` with manual scan review status, reads back required fields/attachments as Admin, denies anonymous evidence download, and cleans up test-only proof records.
- The Legal Intake / Legal Evidence canary proves one Legal top-level Admin tab, legal request list/create/open/status/timeline/evidence linkage, scoped Admin preview/export/hold enforcement, ungranted Admin/moderator/viewer denial, owner normal Legal Intake without reason prompt, proof grant cleanup, and Legal Evidence target coverage.
- Mobile Admin/legal UI now follows the app-wide UI/UX law for the closed-out surfaces: DMCA, Legal, Owner Security, Canary, Safety, Audit Explorer, Permission Templates, Break Glass, public copyright report, and uploader counter-notice use production panels/states, exact disabled reasons, no raw debug proof rows, no dead active buttons, and no fake green/zero counters. The follow-up was UI/state-only and did not change legal backend behavior or public site deployment.
