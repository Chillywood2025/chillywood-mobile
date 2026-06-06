# Supabase Auth SMTP CLI Configure Proof

Date: 2026-06-06

Status: completed with verification artifacts

## Scope

This lane validates Supabase Auth branded email delivery behavior for signup and password reset with custom SMTP and route handling that keeps reset links out of auth callback routing.

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
  - `smtp_user: adcc56001@smtp-brevo.com`
  - `smtp_admin_email: adcc56001@smtp-brevo.com`
  - `smtp_sender_name: Chi\'llwood`
  - `smtp_pass: <redacted>`

Readback verification succeeded with the same values (redacted pass).

## Custom SMTP Status Readback

Executed:

`GET /v1/projects/{ref}/config/auth`

Result:

- `GET_STATUS=200`
- Response confirmed SMTP settings are present and match the configured sender/relay inputs (password redacted).

## Forgot-Password Delivery Probe

Executed:

`POST /auth/v1/recover`

- Target used: `rob2037gn@gmail.com`
- `RECOVER_HTTP_STATUS=200`
- Response body: `{}`

Note: first retry with the same target returned `429` with `over_email_send_rate_limit` (`retry after 53 seconds`), then succeeded on a second attempt after cooldown.

### Remaining Delivery Validation

Email inbox delivery and click-through confirmation still require access to the target mailbox.

- `POST /auth/v1/recover` for `rob2037gn@gmail.com` with redirect `chillywoodmobile://reset-password` returned `200` (`{}`), confirming service acceptance.
- SMTP transport and relay credential checks passed (connection/login/no-op and direct handoff test using `smtplib`).
- A direct mail submission to `rob2037gn@gmail.com` using the same Brevo relay credentials was accepted by SMTP (`accepted`), so the current blocker is most likely mailbox/provider deliverability rather than auth API rejection.

## Routing / Callback Proof

- `app/_layout.tsx` now excludes `/reset-password` links from auth-callback handling.
- `app/auth-callback.tsx` remains a direct verification callback destination and routes to login after success.
- `app/reset-password.tsx` routes directly back to `/(auth)/login` after password update.
- This behavior prevents reset links opening policy pages via the wrong deep-link path.

## DNS / sender trust checks

Captured in:

`/tmp/chillywood-supabase-auth-smtp-proof-20260606/dns-email-check.txt`

Observed:

- `chillywoodstream.com` SPF: present (`v=spf1 include:_spf.mx.cloudflare.net ~all`)
- `chillywoodstream.com` DMARC: present (`p=none`, reporting enabled)
- No common checked DKIM selectors were visible in this DNS run for `chillywoodstream.com`.
- `auth.chillywoodstream.com` records: no SPF/DMARC/DKIM confirmed from the same public resolver run.

### Delivery interpretation

- The endpoint accepts requests and SMTP handoff succeeds, but `rob2037gn@gmail.com` has not been verifiably observed in this environment yet.
- This is most likely caused by mailbox/provider filtering, delayed inbox delivery, or sender reputation/DMARC/DKIM alignment.
- Next step: switch to a freshly verified mailbox and/or add the missing domain authentication records on the authenticated sender domain before considering auth email infrastructure as fully live.

## Validation executed

- `npm run typecheck`
- `npm run validate:runtime`
- `npm run guard:auth-email-branding-policy`
- `npm run guard:critical-ux-polish-policy`
- `git diff --check`
- `git diff --cached --check`
- targetted secret-pattern scan on changed files and proof artifacts (no secret values introduced)

All checks passed.

## Blockers / next steps

- Mailbox-level proof still pending: confirm actual delivery and confirmable open of the reset link in a safe test inbox.

## Safety

No SMTP secret, Supabase token, API key, service-role key, `.env` file, keystore, or service account JSON was committed. No values were added to docs.
