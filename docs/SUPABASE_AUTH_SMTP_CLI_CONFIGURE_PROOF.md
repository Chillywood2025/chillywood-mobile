# Supabase Auth SMTP CLI Configure Proof

Date: 2026-06-07

Status: Supabase Auth SMTP is configured to Brevo (`smtp-relay.brevo.com`) and reset emails are being sent and delivered to the tested inbox; route/callback handling for recovery links is confirmed to target `reset-password` before `auth-callback`, then return to login.

## Scope

This lane validates Supabase Auth email recovery delivery for configured SMTP and confirms callback routing behavior through app deep-link handling. It does not change monetization, LiveKit, route ownership, payout logic, or content safety behavior.

## Starting State

- Branch: `main...origin/main`
- Starting HEAD: `d460741 Route auth verification to login immediately`
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
- Redacted readback values:
  - `smtp_host: smtp-relay.brevo.com`
  - `smtp_port: 587`
  - `smtp_admin_email: no-reply@chillywoodstream.com`
  - `smtp_sender_name: Chi'llwood`

And config readback via:

- `GET https://api.supabase.com/v1/projects/bmkkhihfbmsnnmcqkoly/config/auth`

Result:

- `GET_STATUS=200`
- Redacted values match expected sender and relay values.

## Forgot-password recovery checks

Executed using project anon key:

- `POST https://bmkkhihfbmsnnmcqkoly.supabase.co/auth/v1/recover`

Observed results:

- `rob2037gn@gmail.com` with `gotrue_redirect_to=chillywoodmobile://reset-password`
  - `HTTP:200` with `{}` after cooldown window.
- immediate repeated request can return:
  - `HTTP:429` with `over_email_send_rate_limit` (security cooldown).
- unknown email probe (`nonexistent_user_zzztest@example.com`) returns:
  - `HTTP:200` with `{}` (auth privacy-safe behavior).

## Provider delivery proof

Brevo transactional readback for `rob2037gn@gmail.com` now shows active delivery:

- `uuid: a3346d6c-f2f8-470e-950b-6a5d869366ef`
- `subject: Reset Your Password`
- `from: no-reply@chillywoodstream.com`
- events: `sent` then `delivered`

## Callback/route proof

Recovery-link routing behavior in `app/_layout.tsx` now:

- treats `type=recovery` and recovery token URLs as reset routes;
- routes recovery links to `/reset-password` directly;
- excludes generic `code` links so signup confirmation stays on `auth-callback` path;
- avoids wrong policy/other pages for recovery flow.

Related route targets:

- `app/auth-callback.tsx` remains a direct auth confirmation destination.
- `app/reset-password.tsx` routes to `/(auth)/login` immediately after successful reset submission.

This proves recovery links are no longer captured by auth-callback routing.

## DNS/sender trust checks

Captured under:

`/tmp/chillywood-brevo-domain-auth-smtp-proof-20260606/exact-brevo-record-checks.txt`

Observed:

- SPF/DKIM/DMARC records are present for Brevo-authenticating domains and hosts used in the SMTP proof.
- Brevo-domain records for the provided `chillywood.*` hostnames are present in DNS and Cloudflare.

## Delivery interpretation

- Transport + provider delivery is now proven for recovery with current SMTP settings (no `500 unexpected_failure` in latest run).
- If an internal tester still does not see an email in the app inbox, the remaining causes are likely mailbox-level, not SMTP-auth configuration:
  - spam/promotions filtering
  - opening stale/previous links (short URLs are time-sensitive)
  - client cache/inbox refresh timing
  - recipient-specific client rules

## Validation executed

- `npm run typecheck`
- `npm run validate:runtime`
- `npm run guard:auth-email-branding-policy`
- `npm run guard:critical-ux-polish-policy`
- `git diff --check`
- `git diff --cached --check`
- targeted secret-pattern scan on modified files (no secret values introduced)

## Closeout and next step

Next manual verification step:

1. confirm receipt in the safe inbox UI for the latest send timestamp,
2. open the latest single recovery email (avoid old/stale links),
3. confirm reset page opens to the app path and updates to login after completion.

## Safety

No SMTP secret, Supabase token, API key, service-role key, `.env` file, keystore, or service account JSON was committed. No secret values were added to docs.
