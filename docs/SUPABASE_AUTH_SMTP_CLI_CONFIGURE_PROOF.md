# Supabase Auth SMTP CLI Configure Proof

Date: 2026-06-06

Status: Supabase SMTP configured, exact Brevo DNS host records applied, recovery dispatch accepted; mailbox click validation pending

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

June 6 follow-up: the sender remains `Chi'llwood <no-reply@chillywoodstream.com>` using the same Brevo relay credentials. The Management API expects `smtp_port` as a string value; after correcting that request shape, the PATCH returned `200`.

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
- `RECOVER_HTTP_STATUS=200`
- Response body: `{}`

Failure classification: no API-level dispatch failure is observed (`200` returned). Mailbox-level validation is still pending (email receipt and click behavior) and must still be confirmed by checking safe test inbox and link action.

Observed routing fix:
- `app/_layout.tsx` now routes `type=recovery` links and `/auth/v1/verify` recovery URLs to `/reset-password` before auth-callback parsing.
- This prevents recovery links from being captured by auth-callback routing and opening the wrong confirmation destination.
- The route classifier does not treat a generic `code` parameter alone as password recovery, so signup confirmation links still route through the auth-callback/login path.


## Remaining Delivery Validation

Email inbox delivery and click-through confirmation still require access to a safe test mailbox.

- `POST /auth/v1/recover` for `rob2037gn@gmail.com` with redirect `chillywoodmobile://reset-password` now returns `200`, indicating API accept/replay path is open.
- Reset-link open-to-login confirmation is still pending on user inbox proof. If inbox confirmation is still blocked, classify by first party as DNS-provider trust, sender-domain trust, mailbox acceptance, or postmaster filtering.

## Routing / Callback Proof

- `app/_layout.tsx` now excludes `/reset-password` and `type=recovery` links from auth-callback handling.
- `app/auth-callback.tsx` remains a direct verification callback destination and routes to login after success.
- `app/reset-password.tsx` still routes directly back to `/(auth)/login` after password update.
- This behavior prevents reset links from opening policy pages via the wrong deep-link path.

## DNS / sender trust checks

Captured in:

`/tmp/chillywood-brevo-domain-auth-smtp-proof-20260606/exact-brevo-record-checks.txt`

Observed:

- `chillywoodstream.com` SPF: present (`v=spf1 include:_spf.mx.cloudflare.net ~all`)
- `chillywoodstream.com` DMARC: present (`v=DMARC1; p=none; rua=mailto:support@chillywoodstream.com; ...`)
- `chillywoodstream.com` TXT: Brevo verification string present (`brevo-code:...`)
- `brevo1._domainkey.chillywoodstream.com` and `brevo2._domainkey.chillywoodstream.com` CNAMEs are present and resolving to Brevo selectors.
- Exact current Brevo dashboard records provided by the owner are different hostnames:
  - TXT `chillywood` => full DNS name likely `chillywood.chillywoodstream.com`
  - CNAME `brevo1._domainkey.chillywood` => full DNS name likely `brevo1._domainkey.chillywood.chillywoodstream.com`
  - CNAME `brevo2._domainkey.chillywood` => full DNS name likely `brevo2._domainkey.chillywood.chillywoodstream.com`
  - TXT `_dmarc.chillywood` => full DNS name likely `_dmarc.chillywood.chillywoodstream.com`
- The exact `chillywood.*` host records were added in Cloudflare using the existing Cloudflare email/API-key auth already present in the shell.
- Public DNS and authoritative Cloudflare nameserver checks now resolve the exact TXT, DKIM CNAME, and DMARC records.
- Proof file: `/tmp/chillywood-brevo-domain-auth-smtp-proof-20260606/cloudflare-post-create-authoritative-proof.txt`

### Delivery interpretation

- Recovery dispatch is currently accepted by Supabase Auth API (`200`), so the current blocker is mailbox-level/Inbox acceptance rather than API transport.
- Next step: refresh Brevo's domain authentication check if the dashboard has not already updated, then re-open the safe test inbox for delivery and reset-link behavior.

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

- Brevo dashboard-side authentication status still needs visual/dashboard confirmation after DNS propagation.
- Mailbox-level proof still pending: confirm the reset email arrives from `Chi'llwood <no-reply@chillywoodstream.com>`, opens `chillywoodmobile://reset-password`, and returns to login after a successful reset.

## Safety

No SMTP secret, Supabase token, API key, service-role key, `.env` file, keystore, or service account JSON was committed. No values were added to docs.
