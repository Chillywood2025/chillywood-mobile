# Production Env And Secrets Runbook

Date: 2026-04-26

Lane: Production env / secrets readiness

Purpose: prepare Chi'llywood production runtime configuration, EAS environment variables, and secret boundaries for Public v1 without creating secrets, rotating credentials, printing private values, or running Android/runtime proof.

This runbook is not proof that production env is complete. It records the current repo-backed config owners, the client-safe values the app is allowed to read, the server/dashboard secrets that must never ship in the app client, and the exact manual setup and proof steps required before a production build.

## Guardrails

- Do not commit `.env`, `.env.local`, Play service account JSON, keystores, database passwords, Supabase service-role keys, LiveKit API secrets, RevenueCat private keys, webhook secrets, purchase tokens, JWTs, or signed media URLs.
- Do not print raw env values in docs, chat, screenshots, or proof artifacts.
- Public client config can be included in app runtime only when it is intentionally designed to be public, such as Supabase anon key, RevenueCat public SDK key, Firebase client config, and public URLs.
- Server secrets belong in Supabase function secrets, provider dashboards, EAS credentials, Google Play Console, Firebase, RevenueCat, or host secret stores.
- Unknown or missing config should block protected behavior or show honest unavailable copy. It must not silently unlock Premium, LiveKit, upload, admin, or billing features.
- Static config validation does not equal release proof. A preview/release build must later prove that the intended values were actually embedded.

## Current Repo Snapshot

| Item | Current status |
| --- | --- |
| Runtime config owner | `app.config.ts` writes `extra.runtime`; `_lib/runtimeConfig.ts` reads Expo constants and `EXPO_PUBLIC_*` overrides. |
| Supabase client owner | `_lib/supabase.ts` now honors runtime Supabase URL/anon key when present, with the current deployed public project as fallback. |
| LiveKit runtime owner | `_lib/runtimeConfig.ts` plus `_lib/livekit/token-contract.ts`; client requests tokens from the configured endpoint and does not mint tokens locally. |
| RevenueCat runtime owner | `_lib/revenuecat.ts`, `_lib/monetization.ts`, `_lib/premiumEntitlements.ts`. |
| Firebase config owner | `google-services.json`, `firebase.json`, `app.config.ts`, `_lib/firebase*`. |
| Runtime validation owner | `scripts/validate-runtime.mjs`. |
| EAS profiles | `eas.json` has `development`, `preview`, and `production`; no explicit EAS `environment` binding is configured. |
| Secret ignore posture | `.gitignore` ignores `.env*.local`, native folders, keystores, private keys, and common certificate formats. |
| `.easignore` | Not present; project relies on `.gitignore` and EAS defaults. |
| Local env file | `.env.local` exists locally and is ignored. Values were not printed. |
| Local Supabase metadata | `supabase/.temp/` may exist from Supabase CLI linking and must stay uncommitted. |

## Runtime Config Source Map

| Variable / config | Owner file(s) | System | Dev value source | Production value source | Client-safe or secret | V1 required | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `EXPO_PUBLIC_SUPABASE_URL` | `app.config.ts`, `_lib/runtimeConfig.ts`, `_lib/supabase.ts` | Supabase Auth/API/Storage | `.env.local` or shell env | EAS env / approved release shell | Client-safe public URL | Yes | Implemented / Proof Pending |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | `app.config.ts`, `_lib/runtimeConfig.ts`, `_lib/supabase.ts`, `_lib/creatorVideos.ts` | Supabase client auth/storage/API | `.env.local` or shell env | EAS env / approved release shell | Client-safe public anon key, not service-role | Yes | Implemented / Proof Pending |
| `EXPO_PUBLIC_BETA_OPERATOR_ALLOWLIST` | `app.config.ts`, `_lib/runtimeConfig.ts` | Admin/operator public gate support | `.env.local` or shell env | EAS env / approved release shell | Client-visible allowlist; not backend security | Yes for current `/admin` posture | Implemented / Proof Pending |
| `EXPO_PUBLIC_BETA_ENVIRONMENT` | `app.config.ts`, `_lib/runtimeConfig.ts`, `scripts/validate-runtime.mjs` | Release environment gate | `.env.local` or shell env | EAS env / approved release shell | Client-safe public string | Yes | Implemented / Proof Pending |
| `EXPO_PUBLIC_PRIVACY_POLICY_URL` | `app.config.ts`, `_lib/runtimeConfig.ts`, legal/support routes | Legal/support | Optional env; deployed fallback exists | EAS env with final approved URL | Client-safe public URL | Yes | External Setup Pending |
| `EXPO_PUBLIC_TERMS_OF_SERVICE_URL` | `app.config.ts`, `_lib/runtimeConfig.ts`, legal/support routes | Legal/support | Optional env; deployed fallback exists | EAS env with final approved URL | Client-safe public URL | Yes | External Setup Pending |
| `EXPO_PUBLIC_ACCOUNT_DELETION_URL` | `app.config.ts`, `_lib/runtimeConfig.ts`, settings/account deletion | Account deletion / Play policy | Optional env; deployed fallback exists | EAS env with final approved URL | Client-safe public URL | Yes | External Setup Pending |
| `EXPO_PUBLIC_SUPPORT_EMAIL` | `app.config.ts`, `_lib/runtimeConfig.ts`, support screens | Support | `.env.local` or shell env | EAS env with final support inbox | Client-safe public email | Yes | External Setup Pending |
| `EXPO_PUBLIC_REVENUECAT_ANDROID_PUBLIC_SDK_KEY_DEV` | `app.config.ts`, `_lib/runtimeConfig.ts`, `_lib/revenuecat.ts` | Billing / Premium dev proof | `.env.local` or shell env | Optional preview/internal env | Client-safe RevenueCat public SDK key | Optional for debug/dev | External Setup Pending |
| `EXPO_PUBLIC_REVENUECAT_ANDROID_PUBLIC_SDK_KEY` | `app.config.ts`, `_lib/runtimeConfig.ts`, `_lib/revenuecat.ts` | Billing / Premium production | Optional local test env | EAS production env from RevenueCat dashboard | Client-safe RevenueCat public SDK key | Yes if Premium gates ship live | External Setup Pending |
| `EXPO_PUBLIC_REVENUECAT_IOS_PUBLIC_SDK_KEY` | `app.config.ts`, `_lib/runtimeConfig.ts`, `_lib/revenuecat.ts` | iOS billing later | Optional local env | EAS iOS env later | Client-safe RevenueCat public SDK key | Not Android v1 | Later / External Setup Pending |
| `EXPO_PUBLIC_LIVEKIT_URL` | `app.config.ts`, `_lib/runtimeConfig.ts`, `_lib/livekit/token-contract.ts` | LiveKit / Live Stage / Watch-Party Live | Optional env; deployed fallback exists | EAS env with final `wss://` URL | Client-safe public endpoint | Yes for live features | Partial / Proof Pending |
| `EXPO_PUBLIC_LIVEKIT_TOKEN_ENDPOINT` | `app.config.ts`, `_lib/runtimeConfig.ts`, `_lib/livekit/token-contract.ts` | LiveKit token request | Optional env; deployed fallback exists | EAS env with deployed Supabase function URL | Client-safe public endpoint | Yes for live features | Partial / Proof Pending |
| `EXPO_PUBLIC_COMMUNICATION_ICE_SERVERS` | `app.config.ts`, `_lib/communication.ts` | Chi'lly Chat / communication fallback | Optional JSON env | EAS env only if communication fallback uses custom ICE | Client-visible ICE config; avoid long-lived secrets | Optional / Proof Pending | Partial |
| `EXPO_PUBLIC_COMMUNICATION_STUN_URLS` | `app.config.ts`, `_lib/communication.ts` | Chi'lly Chat / communication fallback | Optional env | EAS env if needed | Client-safe public STUN URLs | Optional / Proof Pending | Partial |
| `EXPO_PUBLIC_COMMUNICATION_TURN_URLS` | `app.config.ts`, `_lib/communication.ts` | Chi'lly Chat / communication fallback | Optional env | EAS env if needed | Client-visible TURN endpoint | Optional / Proof Pending | Partial |
| `EXPO_PUBLIC_COMMUNICATION_TURN_USERNAME` | `app.config.ts`, `_lib/communication.ts` | Chi'lly Chat / communication fallback | Optional env | EAS env only if short-lived/public TURN credentials are intended | Client-visible credential; must be time-limited if used | Optional / Proof Pending | External Setup Pending |
| `EXPO_PUBLIC_COMMUNICATION_TURN_CREDENTIAL` | `app.config.ts`, `_lib/communication.ts` | Chi'lly Chat / communication fallback | Optional env | EAS env only if short-lived/public TURN credentials are intended | Client-visible TURN credential; do not use privileged long-lived secret | Optional / Proof Pending | External Setup Pending |
| Firebase Android config | `google-services.json`, `firebase.json`, `app.config.ts`, `_lib/firebase*` | Crashlytics, Performance, Analytics, Remote Config | Repo Firebase client config | Same file included in release build unless project changes | Client config, but do not print API key values | Yes for diagnostics if shipping Firebase | Implemented / Proof Pending |
| Firebase collection settings | `firebase.json`, `_lib/firebaseCrashlytics.ts`, `_lib/firebasePerformance.ts`, `_lib/firebaseAnalytics.ts`, `_lib/firebaseRemoteConfig.ts` | Diagnostics/analytics | Repo config + Firebase dashboard | Repo config + Firebase dashboard | Config, no app secret | Yes if Firebase remains enabled | Implemented / Proof Pending |
| RevenueCat offering id `premium` | `_lib/monetization.ts` | Billing / Premium | Code constant | RevenueCat dashboard offering must match | Public product model, not secret | Yes if Premium ships | External Setup Pending |
| RevenueCat entitlement id `premium` | `_lib/monetization.ts`, `_lib/premiumEntitlements.ts` | Billing / Premium | Code constant | RevenueCat and backend entitlement must match | Public product model, not secret | Yes if Premium ships | External Setup Pending |
| `creator-videos` bucket name | `_lib/creatorVideos.ts`, Supabase migrations | Creator Media storage | Code constant | Supabase bucket must exist remotely | Public bucket id; policies protect access | Yes | Implemented / Proof Pending |
| `SUPABASE_URL` | `supabase/functions/livekit-token/index.ts`, Supabase function secrets | LiveKit token backend | Local function secrets / Supabase CLI env | Supabase Edge Function secrets | Server-side function env, not app client | Yes for LiveKit token function | External Setup Pending / Proof Pending |
| `SUPABASE_ANON_KEY` | `supabase/functions/livekit-token/index.ts`, Supabase function secrets | LiveKit token backend auth verification | Local function secrets / Supabase CLI env | Supabase Edge Function secrets | Server-side function env; anon key is public but function env should not be printed | Yes | External Setup Pending / Proof Pending |
| `SUPABASE_SERVICE_ROLE_KEY` | `supabase/functions/livekit-token/index.ts`, scripts/admin-only helpers | Backend admin reads/writes | Local secure shell only | Supabase function secrets / secure backend env | Secret; never app client | Yes for token function/admin helpers | External Setup Pending / Proof Pending |
| `LIVEKIT_API_KEY` | `supabase/functions/livekit-token/index.ts`, host config | LiveKit token backend | Local secure shell only | Supabase function secrets and LiveKit host secret store | Secret in current backend setup; never app client | Yes for token function | External Setup Pending / Proof Pending |
| `LIVEKIT_API_SECRET` | `supabase/functions/livekit-token/index.ts`, host config | LiveKit token backend | Local secure shell only | Supabase function secrets and LiveKit host secret store | Secret; never app client | Yes for token function | External Setup Pending / Proof Pending |
| `LIVEKIT_URL` | `supabase/functions/livekit-token/index.ts`, host config | LiveKit token backend | Local secure shell only | Supabase function secrets | Public endpoint but server-side source of returned truth | Yes | External Setup Pending / Proof Pending |
| Google Play service account JSON | RevenueCat/Google/EAS setup | Billing/store submit | Not in repo | Google/RevenueCat/EAS dashboards only | Secret | Yes if store billing/submit ship | External Setup Pending |
| EAS Android signing credentials / keystore passwords | EAS credentials / Play Console | Release signing | Not in repo | EAS credentials or secure local owner store | Secret | Yes | External Setup Pending |
| Database passwords / CLI login | Supabase CLI/dashboard | Remote schema/RLS proof | Not in repo | Approved local secret manager/session only | Secret | Yes for remote proof | External Setup Pending |

## Client-Safe Public Config

These may be present in the client bundle when intentionally configured:

- Supabase project URL.
- Supabase anon key.
- RevenueCat public SDK keys.
- Firebase Android client config.
- Public URLs and domains, including legal/support URLs, LiveKit WebSocket URL, and token endpoint URL.
- Public feature flag names and public runtime mode strings.
- Public storage bucket names such as `creator-videos`; Storage RLS remains the security owner.

Client-safe does not mean careless. Public values should still be configured deliberately, not copied into logs, screenshots, or chat when unnecessary.

## Secrets That Must Never Ship In The App Client

- Supabase service-role key.
- Supabase database password or remote CLI login password.
- LiveKit API secret.
- LiveKit API key if it is paired with the API secret for backend token minting.
- LiveKit participant tokens / JWTs.
- Supabase user access tokens / JWTs.
- RevenueCat private API keys, webhook secrets, receipt payloads, and purchase tokens.
- Google Play service account JSON.
- Firebase service account JSON or private keys.
- Android upload keystore, key alias password, store password, or EAS credential material.
- JWT signing secrets.
- Provider API tokens such as Hetzner, Cloudflare, or host automation tokens.
- Signed creator-video URLs or signed storage URLs.
- Long-lived TURN credentials. If client TURN credentials are used, they should be deliberately short-lived/least-privilege or generated by a backend path.

## EAS Env Readiness

Current `eas.json` does not bind build profiles to EAS named environments. That is acceptable for this prep lane, but the release owner must make one deliberate choice before production builds:

1. Configure the required variables in the EAS project environment and run builds from that environment if the team adds explicit `environment` fields later.
2. Export the release env in a secure local shell before `npx eas-cli build` and verify the generated public Expo config before building.
3. Use the Expo dashboard/EAS env tooling to store public runtime values and keep server-side secrets out of Expo public config.

Recommended safe inspection commands for a later approved release session:

```bash
npx eas-cli env:list --environment preview
npx eas-cli env:list --environment production
```

Recommended setup command shape for public runtime values, run manually by the release owner and adjusted for the installed EAS CLI syntax:

```bash
npx eas-cli env:create --environment production --name EXPO_PUBLIC_SUPABASE_URL --value <value> --visibility plain
npx eas-cli env:create --environment production --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value <value> --visibility sensitive
npx eas-cli env:create --environment production --name EXPO_PUBLIC_BETA_ENVIRONMENT --value public-v1 --visibility plain
npx eas-cli env:create --environment production --name EXPO_PUBLIC_BETA_OPERATOR_ALLOWLIST --value <ids-or-emails> --visibility sensitive
npx eas-cli env:create --environment production --name EXPO_PUBLIC_REVENUECAT_ANDROID_PUBLIC_SDK_KEY --value <value> --visibility sensitive
npx eas-cli env:create --environment production --name EXPO_PUBLIC_LIVEKIT_URL --value <wss-url> --visibility plain
npx eas-cli env:create --environment production --name EXPO_PUBLIC_LIVEKIT_TOKEN_ENDPOINT --value <https-url> --visibility plain
npx eas-cli env:create --environment production --name EXPO_PUBLIC_PRIVACY_POLICY_URL --value <url> --visibility plain
npx eas-cli env:create --environment production --name EXPO_PUBLIC_TERMS_OF_SERVICE_URL --value <url> --visibility plain
npx eas-cli env:create --environment production --name EXPO_PUBLIC_ACCOUNT_DELETION_URL --value <url> --visibility plain
npx eas-cli env:create --environment production --name EXPO_PUBLIC_SUPPORT_EMAIL --value <email> --visibility plain
```

Do not run `env:create` from Codex without explicit approval because it creates or changes live release configuration.

## Runtime Validation Readiness

`scripts/validate-runtime.mjs` now checks:

- Required base runtime names:
  - `EXPO_PUBLIC_SUPABASE_URL`
  - `EXPO_PUBLIC_SUPABASE_ANON_KEY`
  - `EXPO_PUBLIC_BETA_OPERATOR_ALLOWLIST`
  - `EXPO_PUBLIC_BETA_ENVIRONMENT`
- `EXPO_PUBLIC_BETA_ENVIRONMENT` is either `closed-beta` or `public-v1`.
- Expo public config has `extra.eas.projectId`.
- Expo Updates URL matches the EAS project id.
- Runtime version exists.
- Expo public runtime config resolves Supabase, LiveKit, and legal URL fields.
- Output prints only presence booleans and non-secret project/runtime facts, not raw env values.

Strict production mode:

```bash
CHILLYWOOD_VALIDATE_PRODUCTION_ENV=1 npm run validate:runtime
```

Strict mode also requires:

- `EXPO_PUBLIC_LIVEKIT_URL`
- `EXPO_PUBLIC_LIVEKIT_TOKEN_ENDPOINT`
- `EXPO_PUBLIC_REVENUECAT_ANDROID_PUBLIC_SDK_KEY`
- `EXPO_PUBLIC_PRIVACY_POLICY_URL`
- `EXPO_PUBLIC_TERMS_OF_SERVICE_URL`
- `EXPO_PUBLIC_ACCOUNT_DELETION_URL`
- `EXPO_PUBLIC_SUPPORT_EMAIL`
- `EXPO_PUBLIC_BETA_ENVIRONMENT=public-v1`

Strict mode is the recommended pre-build check for release candidates. It still does not prove that store billing, LiveKit, Firebase, or Supabase dashboards are correctly configured; it only proves the build-time public config names resolve.

## Logging And Privacy Readiness

Static audit result for this lane:

- `debugLog()` is dev-only.
- Creator upload diagnostics are dev-only and do not print signed URLs.
- Player and Watch-Party source diagnostics are dev-only.
- LiveKit mobile code passes participant tokens to SDK components but does not log them.
- `supabase/functions/livekit-token/index.ts` reads server secrets and returns a participant token; the server catch logs a generic failure object. Supabase function logs still need dashboard review during token proof.
- RevenueCat SDK log mirroring is now suppressed outside `__DEV__`; app-owned purchase/restore failures still use existing error/reporting paths without printing receipts or purchase tokens.
- Firebase Crashlytics receives app errors by design; future callers must avoid signed URLs, JWTs, purchase receipts, and tokens in metadata.

Release log audit is still required from a preview/release build. Do not mark this lane Done until bounded release logs show no Supabase JWTs, signed media URLs, LiveKit participant tokens, RevenueCat receipts/purchase tokens, service-role keys, Google private credentials, or keystore details.

## Production Build Env Checklist

| Check | Status | Proof required |
| --- | --- | --- |
| Base runtime env names are set | Proof Pending | `npm run validate:runtime` passes from release env. |
| Strict production env names are set | Proof Pending | `CHILLYWOOD_VALIDATE_PRODUCTION_ENV=1 npm run validate:runtime` passes. |
| Supabase client uses intended project | Implemented / Proof Pending | Release build auth/storage calls hit intended project; no schema drift. |
| LiveKit public endpoint resolves | Partial / Proof Pending | App config shows intended `wss://` endpoint and token function; device proof connects. |
| RevenueCat public SDK key configured | External Setup Pending | `/subscribe` loads the expected offering in release-like build. |
| Firebase Android config included | Implemented / Proof Pending | Firebase dashboards receive Crashlytics/Performance data from release-like build. |
| Legal/support URLs final | External Setup Pending | Public URLs open without login and match Play Console entries. |
| Server secrets stay server-side | External Setup Pending / Proof Pending | Supabase/RevenueCat/Firebase/Google/host dashboards checked without printing values. |
| `.env` and local metadata uncommitted | Implemented / Proof Pending | `git status --short` stays clean except allowed local metadata. |

## Manual Actions For Release Owner

1. Confirm the target Supabase project and copy only the public project URL and anon key into the EAS production environment.
2. Confirm Supabase service-role key stays only in Supabase function secrets or approved backend tooling.
3. Confirm `livekit-token` function secrets exist for `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, and `LIVEKIT_URL`.
4. Confirm the mobile release env uses `EXPO_PUBLIC_LIVEKIT_URL` and `EXPO_PUBLIC_LIVEKIT_TOKEN_ENDPOINT` matching the production LiveKit runbook.
5. Configure RevenueCat dashboard and set `EXPO_PUBLIC_REVENUECAT_ANDROID_PUBLIC_SDK_KEY` for production.
6. Confirm `google-services.json` is the intended production Firebase Android app config for package `com.chillywood.mobile`.
7. Finalize Privacy, Terms, Account Deletion, and Support public URLs and set them in production env.
8. Confirm no `.env`, keystore, service account JSON, database password, or `.temp` metadata is staged.
9. Run:
   ```bash
   npm run validate:runtime
   CHILLYWOOD_VALIDATE_PRODUCTION_ENV=1 npm run validate:runtime
   npm run typecheck
   npm run lint
   git diff --check
   ```
10. Run a preview build only after env checks pass.
11. During preview/release smoke, capture sanitized endpoint presence, not raw secret values.

## Status Matrix

| Area | Status | Reason | Next action |
| --- | --- | --- | --- |
| Runtime config source map | Implemented / Proof Pending | Owners and required values are documented here; runtime proof still pending. | Verify release build public config shape without printing values. |
| Supabase public runtime config | Implemented / Proof Pending | Client now honors runtime config when present and falls back to current deployed public project. | Run release env validation and remote API proof. |
| RevenueCat public runtime config | External Setup Pending | Runtime owner exists; dashboard product/offering/public key setup remains external. | Complete RevenueCat/Play setup and set production public SDK key. |
| LiveKit public runtime config | Partial / Proof Pending | Deployed fallbacks and env overrides exist; network/token proof remains pending. | Follow LiveKit runbook and strict env validation. |
| Firebase config | Implemented / Proof Pending | Config file and plugins exist; dashboard receipt still pending. | Prove Crashlytics/Performance from release-like build. |
| Legal/support runtime config | External Setup Pending | Fallback URLs exist; final public legal/support URLs still need legal/Play approval. | Set final URLs and prove they open without login. |
| Secret boundary | Partial / Proof Pending | Repo ignores local env/secrets; runbook separates public config from server secrets. | Run release log and git status audits before build. |
| Runtime validation script | Implemented / Proof Pending | Base and strict production validation exist without printing values. | Run strict validation from the release env. |

## Exact Next Action

Release owner should configure the EAS production env names listed above, keep all server secrets in their proper dashboards/secret stores, and run:

```bash
CHILLYWOOD_VALIDATE_PRODUCTION_ENV=1 npm run validate:runtime
```

Only after that passes should the release lane proceed to preview build proof, release log audit, Supabase/LiveKit/Firebase proof, and final route smoke.
