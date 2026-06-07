# Supabase Auth SMTP CLI Configure Proof

Date: 2026-06-07

Status: Supabase Auth SMTP is configured to Brevo (`smtp-relay.brevo.com`) and recovery dispatch is accepted by auth. Route/callback handling is confirmed to target `reset-password` before `auth-callback`, then return to login.

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
  - `smtp_sender_name: Chi'llwood`

And config readback via:

- `GET https://api.supabase.com/v1/projects/bmkkhihfbmsnnmcqkoly/config/auth`

Result:

- `GET_STATUS=200`
- Redacted readback matches expected sender and relay values.

## Forgot-password recovery checks

Executed using project anon key:

- `POST https://bmkkhihfbmsnnmcqkoly.supabase.co/auth/v1/recover`

Observed results:

- `rob2037gn@gmail.com` with `gotrue_redirect_to=chillywoodmobile://reset-password`
  - `HTTP:200` with `{}` after cooldown window.
  - Latest send timestamp: `20260607T005540Z`
- immediate repeated request can return:
  - `HTTP:429` with `over_email_send_rate_limit` (security cooldown).
- unknown email probe (`nonexistent_user_zzztest@example.com`) returns:
  - `HTTP:200` with `{}` (auth privacy-safe behavior).

## Provider/readback checks

We re-verified provider-readback paths for this pass:

- Supabase Auth config readback remains correct and complete.
- Brevo v3 API probe for transactional log/statistics endpoints returned `401 Key not found` for every attempted `/v3/smtp/*`, `/v3/senders*`, and `/v3/account` call using the user-provided token.
- Interpretation: mailbox-side/route telemetry is currently blocked by credential type mismatch (provided credential is valid for SMTP, not for Brevo API REST).
- Because of that, direct provider message status proof is still pending in this lane.

## Callback/route proof

Recovery-link routing behavior in `app/_layout.tsx` now:

- treats `type=recovery` and recovery-token URLs as reset routes;
- routes recovery links to `/reset-password` directly;
- excludes generic `code` links so signup confirmation stays on `auth-callback` path;
- avoids wrong policy/other pages for recovery flow.

Related route targets:

- `app/auth-callback.tsx` remains a direct auth confirmation destination.
- `app/reset-password.tsx` routes to `/(auth)/login` immediately after successful reset submission.

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

- SMTP transport setup and in-app recovery link handling are correct.
- Recipient mailbox receipt remains the remaining unknown in this pass because direct Brevo message-trace proof was not retrievable with the supplied key.
- In practice, the likely remaining blockers are recipient-side:
  - spam/promotions filtering
  - stale email link usage
  - inbox cache/refresh delay
  - Gmail-side rules/postbox routing

## Validation executed

- `npm run typecheck`
- `npm run validate:runtime`
- `npm run guard:auth-email-branding-policy`
- `npm run guard:critical-ux-polish-policy`
- `git diff --check`
- `git diff --cached --check`

## Closeout and next step

Next manual verification step:

1. confirm receipt in the safe inbox UI for timestamp `20260607T005540Z`,
2. open only the latest single recovery email (avoid old/stale links),
3. confirm reset page opens with `chillywoodmobile://reset-password`,
4. confirm success returns to login.

If the message still never appears, the highest-confidence unblockers are:

- rotate/replace the Brevo SMTP password with a known-good SMTP key pair,
- supply a valid Brevo REST API key (not the SMTP login token) to continue provider trail lookup,
- capture inbox logs from a direct mailbox API (Gmail API or mail test inbox).

## Safety

No SMTP secret, Supabase token, API key, service-role key, `.env` file, keystore, or service account JSON was committed. No secret values were added to docs.
