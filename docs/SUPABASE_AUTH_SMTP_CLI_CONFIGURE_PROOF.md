# Supabase Auth SMTP CLI Configure Proof

Date: 2026-06-06

Status: completed with verification artifacts

## Scope

This lane validates Supabase Auth branded email delivery behavior for signup and password reset with custom SMTP and route handling that keeps reset links out of auth-callback routing.

It does not change monetization, LiveKit, route ownership, payout surfaces, or safety/entitlement logic.

## Starting State

- Branch: `main...origin/main`
- Starting HEAD: `d460741 Route auth verification to login immediately`
- Tracked workspace edits before this lane:
  - `app/_layout.tsx`
  - `scripts/guard-auth-email-branding-policy.mjs`
- Untracked paths intentionally untouched:
  - `artifacts/`
  - `supabase/.temp/`
- Supabase project reference used:
  - `bmkkhihfbmsnnmcqkoly`

## Environment Precheck (presence only)

All required environment variable names were validated for presence before applying commands. Values were never printed.

- `SUPABASE_ACCESS_TOKEN`
- `PROJECT_REF`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_ADMIN_EMAIL`
- `SMTP_SENDER_NAME`

## Supabase Auth SMTP Mutation

Executed:

`PATCH /v1/projects/{ref}/config/auth`

Endpoint used:

`https://api.supabase.com/v1/projects/bmkkhihfbmsnnmcqkoly/config/auth`

Result:

- `PATCH_STATUS=200`
- Redacted response includes configured SMTP values:
  - `smtp_host: smtp-relay.brevo.com`
  - `smtp_port: 587`
  - `smtp_user: [redacted]`
  - `smtp_admin_email: no-reply@chillywoodstream.com`
  - `smtp_sender_name: Chi'llwood`
  - `smtp_pass: [redacted]`

Readback verification succeeded with the same sender/relay values (password/user redacted).

## Custom SMTP Status Readback

Executed:

`GET /v1/projects/{ref}/config/auth`

Result:

- `GET_STATUS=200`
- Redacted readback snapshot:
  - `smtp_host: smtp-relay.brevo.com`
  - `smtp_port: 587`
  - `smtp_user: [redacted]`
  - `smtp_pass: [redacted]`
  - `smtp_admin_email: no-reply@chillywoodstream.com`
  - `smtp_sender_name: Chi'llwood`

## Forgot-Password Delivery Probe

Executed:

`POST /auth/v1/recover`

- Target used: `rob2037gn@gmail.com`
- `RECOVER_HTTP_STATUS=500`
- Response body: `{"code":500,"error_code":"unexpected_failure","msg":"Error sending recovery email","error_id":"019e9e73-871b-74b5-b384-9028b3a58129"}`

Failure classification: `unexpected_failure` from recovery API indicates transport/provider dispatch rejected at send time before reset email delivery.

## Remaining Delivery Validation

Email inbox delivery and click-through confirmation still require access to a safe test mailbox.

- `POST /auth/v1/recover` for `rob2037gn@gmail.com` with redirect `chillywoodmobile://reset-password` currently returns `500` (`unexpected_failure`), so reset-link open-to-login confirmation cannot be re-run from inbox yet.
- Previous lane had successful transport checks in earlier snapshots; this should now be treated as a sender-domain trust/provisioning acceptance issue and revalidated after domain signature and sender verification are confirmed in Brevo.

## Routing / Callback Proof

- `app/_layout.tsx` still excludes `/reset-password` links from auth-callback handling.
- `app/auth-callback.tsx` remains a direct verification callback destination and routes to login after success.
- `app/reset-password.tsx` still routes directly back to `/(auth)/login` after password update.
- This behavior prevents reset links from opening policy pages via the wrong deep-link path.

## DNS / sender trust checks

Captured in:

`/tmp/chillywood-supabase-auth-smtp-proof-20260606/dns-email-check.txt`

Observed:

- `chillywoodstream.com` SPF: present (`v=spf1 include:_spf.mx.cloudflare.net ~all`)
- `chillywoodstream.com` DMARC: present (`p=none`, reporting enabled)
- No common checked DKIM selectors were visible in this DNS pass for `chillywoodstream.com`.
- `auth.chillywoodstream.com` records: no SPF/DMARC/DKIM confirmed from this resolver run.

### Delivery interpretation

- Recovery dispatch is currently blocked at the auth API send step for the tested target/sender state.
- This is most likely tied to sender trust/provisioning or mailbox acceptance rather than app-side deep-link route logic.
- Next step: confirm sender-domain and DKIM/Trust status in the Brevo dashboard, then rerun this send with a fresh test inbox.

## Validation executed

- `npm run typecheck`
- `npm run validate:runtime`
- `npm run guard:auth-email-branding-policy`
- `npm run guard:critical-ux-polish-policy`
- `git diff --check`
- `git diff --cached --check`
- targeted secret-pattern scan on changed files and proof artifacts (no secret values introduced)

All checks passed.

## Blockers / next steps

- Mailbox-level proof still pending: confirm `POST /auth/v1/recover` returns `200` for the same target and confirmable open of the reset link to login in a safe test inbox.

## Safety

No SMTP secret, Supabase token, API key, service-role key, `.env` file, keystore, or service account JSON was committed. No values were added to docs.
