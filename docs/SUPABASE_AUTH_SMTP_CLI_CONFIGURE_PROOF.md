# Supabase Auth SMTP CLI Configure Proof

Date: 2026-06-06

Status: blocked before Management API mutation.

## Scope

This lane attempted to configure or verify Supabase Auth custom SMTP through the CLI/Management API and then prove the forgot-password/password-reset delivery path. The lane did not change app auth policy, Premium, Money, LiveKit, Watch-Party, RLS, Player, Platform Studio, Admin behavior, or route ownership.

## Starting State

- Branch: `main...origin/main`
- Starting HEAD: `3e58a63 Clarify auth email branding external blocker`
- Tracked worktree: clean
- Existing untracked paths present and untouched:
  - `artifacts/`
  - `supabase/.temp/`
- Supabase CLI login: available
- Supabase project `bmkkhihfbmsnnmcqkoly`: visible through CLI and `ACTIVE_HEALTHY`
- Runtime validation: passed

## Local Environment Preflight

The required local shell variables were checked by presence only. Values were not printed.

| Variable | Status |
| --- | --- |
| `SUPABASE_ACCESS_TOKEN` | missing |
| `PROJECT_REF` | missing |
| `SMTP_HOST` | missing |
| `SMTP_PORT` | missing |
| `SMTP_USER` | missing |
| `SMTP_PASS` | missing |
| `SMTP_ADMIN_EMAIL` | missing |
| `SMTP_SENDER_NAME` | missing |

Because the Management API bearer token and SMTP provider credentials were absent from the local shell, no `PATCH /v1/projects/{ref}/config/auth` mutation was attempted.

## Sender Target

Recommended production Auth sender remains:

- From email: `no-reply@auth.chillywoodstream.com`
- Sender name: `Chi'llwood`
- Support/reply path: `support@chillywoodstream.com`, unless a provider-specific reply address is approved

This proof does not claim that sender is configured in Supabase.

## Current App Auth Flow

Repo-side app redirects are already wired:

- Signup confirmation uses `chillywoodmobile://auth/callback`
- Forgot password uses `supabase.auth.resetPasswordForEmail` with `chillywoodmobile://reset-password`
- Reset-password screen consumes token or code recovery links and returns to login after a successful password update
- Signup success copy tells the user to verify email and then returns to login from the success alert

The app uses clean user-facing reset copy for rate limits, invalid email, missing/expired links, and update failures. It does not show raw provider payloads or backend secrets.

## Forgot-Password Proof Result

Delivery proof was not run because custom SMTP was not configured and no safe inbox proof path was available in this shell. A Supabase Auth recover API success would only prove request acceptance, not inbox delivery, so this lane does not claim email arrival.

Required proof after credentials are available:

1. Configure custom SMTP through the Management API or Supabase Dashboard.
2. Send one forgot-password email to an owner-controlled safe test inbox.
3. Verify delivery, sender, subject, and Chi'llwood template.
4. Open the reset link and confirm it routes to `chillywoodmobile://reset-password`.
5. Update the password and confirm the app returns to login.

## DNS Proof

DNS proof was captured under:

`/tmp/chillywood-supabase-auth-smtp-proof-20260606/dns-email-check.txt`

Current public DNS result:

| Item | Status |
| --- | --- |
| Root SPF | Present: `v=spf1 include:_spf.mx.cloudflare.net ~all` |
| Root DMARC | Present: `v=DMARC1; p=none; rua=mailto:support@chillywoodstream.com; adkim=r; aspf=r; fo=1` |
| Common root DKIM selectors | No DKIM TXT/CNAME returned for checked selectors |
| `auth.chillywoodstream.com` SPF | Not found in checked public DNS |
| `auth.chillywoodstream.com` DMARC | Not found in checked public DNS |
| Common `auth.chillywoodstream.com` DKIM selectors | No DKIM TXT/CNAME returned for checked selectors |

DKIM remains pending until the chosen outbound provider issues selector records and those records are published and verified.

## Rate-Limit Posture

Supabase default SMTP rate limiting can still block repeated forgot-password attempts until custom SMTP is configured. After custom SMTP is configured, provider-side rate limits and Supabase Auth abuse controls still apply. The app already presents clean retry copy for reset email rate limits. CAPTCHA or additional reset throttling should be a separate security lane, not part of SMTP setup.

## Validation

Passed:

- `npm run validate:runtime`

Not rerun in this blocked docs-only pass:

- `npm run typecheck`
- auth/security guard stack

No app/source mutation was made in this lane.

## Remaining Owner Actions

Provide these values through a local shell-only secret path or configure them directly in Supabase Dashboard:

- `SUPABASE_ACCESS_TOKEN`
- `PROJECT_REF=bmkkhihfbmsnnmcqkoly`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_ADMIN_EMAIL=no-reply@auth.chillywoodstream.com`
- `SMTP_SENDER_NAME=Chi'llwood`

Then rerun the Management API PATCH and real inbox delivery proof without committing or printing secrets.

## Safety

No SMTP password, Supabase access token, service-role key, `.env` file, API key, provider secret, keystore, service account JSON, inbox content, auth token, or private email header was committed or printed.
