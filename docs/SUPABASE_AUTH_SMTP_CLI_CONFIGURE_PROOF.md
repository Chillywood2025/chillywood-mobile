# Supabase Auth SMTP CLI Configure Proof

Date: 2026-06-07

Latest recovery check: 2026-06-10

Status: Supabase Auth SMTP is configured to Brevo (`smtp-relay.brevo.com`) with sender identity `Chi'llywood <no-reply@chillywoodstream.com>`. The Brevo SMTP key was rotated locally after a temporary `535 Authentication failed` blocker, direct SMTP auth now passes, Supabase Auth SMTP patch/readback returns `200` with secrets redacted, and `POST /auth/v1/recover` to the safe test inbox returns `200 {}` again. The app-side route/callback handling has been tightened so recovery links target `reset-password` before `auth-callback`, signup verification returns to login, and policy/support pages no longer intercept auth links.

## Scope

This lane validates Supabase Auth email recovery setup, re-runs sender routing checks, and runs an inbox-arrival diagnostic pass focused on DNS/recipient/mail-route signals. It does not change monetization, LiveKit, route ownership, payout logic, or content safety behavior.

## Starting State

- Branch: `main...origin/main`
- Starting HEAD: `d31e0d0 Fix auth verify/reset routing to login`
- Untracked paths intentionally untouched:
  - `artifacts/`
  - `supabase/.temp/`
- Supabase project reference used:
  - `bmkkhihfbmsnnmcqkoly`

## Environment precheck

Required variable names were verified present only (values were never printed):

- `SUPABASE_ACCESS_TOKEN`
- `PROJECT_REF`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_ADMIN_EMAIL`
- `SMTP_SENDER_NAME`

## SMTP configuration

Executed:

- `PATCH https://api.supabase.com/v1/projects/bmkkhihfbmsnnmcqkoly/config/auth`

Result:

- `PATCH_STATUS=200`
- `smtp_port` sent as string per API schema
- Redacted readback values:
  - `smtp_host: smtp-relay.brevo.com`
  - `smtp_port: 587`
  - `smtp_admin_email: no-reply@chillywoodstream.com`
  - `smtp_sender_name: Chi'llywood`

And config readback via:

- `GET https://api.supabase.com/v1/projects/bmkkhihfbmsnnmcqkoly/config/auth`

Result:

- `GET_STATUS=200`
- Redacted readback matches expected sender and relay values.

## Forgot-password recovery checks

Executed using project anon key:

- `POST https://bmkkhihfbmsnnmcqkoly.supabase.co/auth/v1/recover`

Observed results:

- Prior 2026-06-07 result for `rob2037gn@gmail.com` with `gotrue_redirect_to=chillywoodmobile://reset-password`
  - `HTTP:200` with `{}` after cooldown window.
  - Latest send timestamp: `20260607T005540Z`
- Pre-rotation 2026-06-10 rerun for `rob2037gn@gmail.com` with `redirect_to=chillywoodmobile://reset-password`
  - `HTTP:500`
  - redacted error: `unexpected_failure` / `Error sending recovery email`
  - direct Brevo SMTP login using the locally stored SMTP key returns `535 Authentication failed`
- Post-rotation 2026-06-10 rerun for `rob2037gn@gmail.com` with `redirect_to=chillywoodmobile://reset-password`
  - direct Brevo SMTP login: pass
  - Supabase Auth SMTP patch: `HTTP:200`
  - Supabase Auth SMTP readback: `HTTP:200`, secrets redacted
  - `POST /auth/v1/recover`: `HTTP:200` with `{}`
  - send timestamp: `2026-06-11T01:10:42Z`
- immediate repeated request can return:
  - `HTTP:429` with `over_email_send_rate_limit` (security cooldown).
- unknown email probe (`nonexistent_user_zzztest@example.com`) returns:
  - `HTTP:200` with `{}` (auth privacy-safe behavior).

## Provider/readback checks

Provider-readback paths now pass again after key rotation:

- The Supabase project remains `bmkkhihfbmsnnmcqkoly`.
- The Brevo REST API token available locally can read account/relay status and shows SMTP relay enabled on `smtp-relay.brevo.com:587`.
- The rotated Brevo SMTP key passes direct SMTP authentication.
- Supabase Management API calls through `curl` with the CLI-style user agent avoid the Python/Cloudflare `1010` signature blocker and return `200`.
- Hosted Auth SMTP patch/readback succeeded with secrets redacted.
- Interpretation: the server-side email transport is restored. Remaining proof is mailbox/device click-through from the newest message.

## Callback/route proof

Recovery-link routing behavior in `app/_layout.tsx` now:

- treats `type=recovery` and recovery-token URLs as reset routes;
- routes recovery links to `/reset-password` directly;
- excludes generic `code` links so signup confirmation stays on `auth-callback` path;
- avoids wrong policy/other pages for recovery flow;
- keeps public legal/support pages public unless real auth/recovery parameters are present.

Related route targets:

- `app/auth-callback.tsx` remains a direct auth confirmation destination.
- `app/auth-callback.tsx` now consumes `code`, `token_hash`, `token + email`, or session tokens, signs out after verification, and routes immediately to `/(auth)/login`.
- `app/reset-password.tsx` consumes `code`, `token_hash`, `token + email`, or session tokens for recovery, updates the password through Supabase Auth, signs out, and routes immediately to `/(auth)/login`.
- Compatibility shims route `/auth/callback`, `/auth/verify`, `/auth/v1/verify`, `/callback`, and `/verify` into `auth-callback` when Supabase or old links use those paths.

## EAS/device proof

After commit `7adfb01 Fix auth email reset and verification routing`, an Android EAS Update was published to the `production` branch:

- update group: `172b48a1-1b58-45f0-ac93-c7b878cfb940`
- Android update: `019eb441-ce6b-768e-a484-5782e89d6895`
- runtime: `1.0.0`
- manifest: `https://u.expo.dev/update/019eb441-ce6b-768e-a484-5782e89d6895`

Play-installed device proof:

- device: `R3CXA0DS5JV` / `SM_S928U1`
- package: `com.chillywood.mobile`
- installer: `com.android.vending`
- versionName/versionCode: `1.0.0` / `25`
- proof path: `/tmp/chillywood-auth-email-device-proof-20260610-final/`

Captured proof:

- `01-app-open-after-ota.png`: Play-installed app opens to Chi'llywood login, not Expo Dev Launcher.
- `04-reset-deeplink-screen.png`: `chillywoodmobile://reset-password?type=recovery` opens the app Reset Password screen, not Chrome/policy/auth-callback. Synthetic no-token probe correctly shows missing/expired link copy.
- `07-auth-callback-to-login-screen.png`: `chillywoodmobile://auth/callback?type=signup` returns to Login instead of policy page.

The remaining real-user proof is to open the newest real reset email sent after `2026-06-11T01:10:42Z`, tap its provider token link, set the password, and confirm sign-in.

## DNS and mail-route diagnostics

Captured at:

- `/tmp/chillywood-inbox-arrival-diagnostics-20260607/dns_checks.txt`

Latest observed DNS status:

- `chillywoodstream.com` SPF TXT: `brevo-code:d6b1f6ef8dabad2f3a5b9a3fcda6f9e9`
- `chillywoodstream.com` SPF: `v=spf1 include:_spf.mx.cloudflare.net ~all`
- `_dmarc.chillywoodstream.com` TXT: `v=DMARC1; p=none; rua=mailto:support@chillywoodstream.com; adkim=r; aspf=r; fo=1`
- `brevo1._domainkey.chillywoodstream.com` CNAME: `b1.chillywoodstream-com.dkim.brevo.com.`
- `brevo2._domainkey.chillywoodstream.com` CNAME: `b2.chillywoodstream-com.dkim.brevo.com.`
- `gmail.com` MX is healthy.
- `chillywoodstream.com` MX is `route1/2/3.mx.cloudflare.net.` (unrelated to Gmail delivery, but useful for domain routing hygiene)

## Delivery interpretation

- In-app recovery and signup link routing are corrected repo-side.
- SMTP transport is restored after key rotation.
- The next proof must:
  - confirm the newest email reaches `rob2037gn@gmail.com`,
  - tap the reset link on the Play/internal app runtime,
  - prove it opens reset-password instead of policy/auth-callback/Chrome,
  - update the password,
  - prove reset success returns to login,
  - prove sign-in with the new password.

## Validation executed

- `npm run typecheck`
- `npm run validate:runtime`
- `npm run guard:auth-email-branding-policy`
- `npm run guard:critical-ux-polish-policy`
- `git diff --check`
- `git diff --cached --check`

## Closeout and next step

Next manual verification step:

1. Open only the newest recovery email sent after `2026-06-11T01:10:42Z`.
2. Confirm sender is `Chi'llywood <no-reply@chillywoodstream.com>`.
3. Tap the reset link on the Play/internal runtime.
4. Confirm reset-password opens, password update succeeds, and login works.

If the message still never appears after SMTP auth and recover dispatch pass, the highest-confidence unblockers are:

- supply a valid Brevo REST API key (not the SMTP login token) to continue provider trail lookup,
- capture inbox logs from a direct mailbox API (Gmail API or mail test inbox).

## Safety

No SMTP secret, Supabase token, API key, service-role key, `.env` file, keystore, or service account JSON was committed. No secret values were added to docs.
