# Supabase Auth Email External Branding Proof

Date: 2026-06-07

Latest recovery check: 2026-06-10

Status: Callback routing is fixed for recovery links and sender branding is configured as `Chi'llywood <no-reply@chillywoodstream.com>`. A temporary SMTP-key failure was reproduced as Supabase Auth recovery `500 unexpected_failure` / `Error sending recovery email` plus Brevo SMTP `535 Authentication failed`; the Brevo SMTP key was then rotated locally, Supabase Auth SMTP was patched/read back with secrets redacted, and recovery dispatch returned `HTTP 200 {}` again. The Play-installed app now uses a dedicated Reset password request screen, and Brevo reports the app-origin reset email delivered to Gmail.

## Scope

This proof confirms auth email callback behavior, Supabase Auth SMTP sender branding, and route handling for password reset links. It does not alter monetization, payouts, LiveKit behavior, or route ownership.

## Execution summary

- project: `bmkkhihfbmsnnmcqkoly`
- sender: `no-reply@chillywoodstream.com`
- sender name: `Chi'llywood`
- recovery endpoint: `chillywoodmobile://reset-password`
- signup verification remains on auth callback path.

## SMTP/app callback status

- `PATCH` on `v1/projects/.../config/auth` succeeded and remains read-backed:
  - `smtp_host: smtp-relay.brevo.com`
  - `smtp_port: 587`
  - `smtp_admin_email: no-reply@chillywoodstream.com`
  - `smtp_sender_name: Chi'llywood`
- `app/_layout.tsx` now treats recovery links as reset routes and does not consume them in the callback handler intended for signup confirmation.
- `app/reset-password.tsx` returns to login on success immediately.

## Send dispatch status

- Prior 2026-06-07 proof: `POST /auth/v1/recover` for `rob2037gn@gmail.com` returned `HTTP 200` with `{}`.
- Pre-rotation 2026-06-10 proof: the same recovery request returned `HTTP 500` with redacted Supabase error `unexpected_failure` / `Error sending recovery email`.
- Pre-rotation direct SMTP login returned `535 Authentication failed`.
- Post-rotation direct SMTP login passes.
- Post-rotation Supabase Auth SMTP patch/readback returns `HTTP 200` with secrets redacted.
- Post-rotation `POST /auth/v1/recover` for `rob2037gn@gmail.com` returns `HTTP 200 {}` at `2026-06-11T01:10:42Z`.
- App-origin proof after `09f3ebc Fix forgot password reset request flow`:
  - EAS update group `4392c7c6-7766-41b6-8f70-e75d6dc4b1db`
  - Android update `019eb456-1e9f-7186-a1eb-1a53f89dde86`
  - proof path `/tmp/chillywood-auth-email-device-proof-20260610-app-origin-final/`
  - Play-installed app shows a dedicated Reset password screen and success copy after submit.
  - Brevo reports the matching reset email requested at `2026-06-10T20:43:20.442-05:00` and delivered at `2026-06-10T20:43:21.000-05:00` to `rob2037gn@gmail.com`, subject `Reset Your Password`, from `no-reply@chillywoodstream.com`, with message id present.

## Recipient/mail-route diagnostics

A follow-up diagnostics pass was run for recipient-side evidence:

- DNS for sender identity and protection is present:
  - `chillywoodstream.com` SPF/DMARC resolvable
  - `brevo1._domainkey.chillywoodstream.com` and `brevo2._domainkey.chillywoodstream.com` CNAMEs resolvable
- recipient domain route (`gmail.com`) is healthy by MX.
- Brevo v3 event readback is now available through local-only credentials. The redacted proof file records request and delivered events without printing credentials or raw provider payloads.

## Remaining gap

- Complete mailbox-side click-through proof from the newest Gmail message.
- The next action is to tap the real provider token link and prove password update returns to login.
- Device proof must continue to use the Play/internal runtime, not Expo Dev Launcher or Chrome-only HTTPS fallback.

## Next step

Capture the fresh recover email sent after `2026-06-10T20:43:21-05:00` in the safe inbox and verify:

1. sender and subject
2. reset link opens reset screen
3. successful reset returns to login
4. no signup-policy route intercepts recovery links

## Safety

No SMTP/API secret, Supabase token, service-role key, `.env` secret, keystore, or service account file was committed. No secret values were added to docs.
