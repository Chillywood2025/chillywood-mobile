# Supabase Auth Email External Branding Proof

Date: 2026-06-07

Latest recovery check: 2026-06-10

Status: Callback routing is fixed for recovery links, sender branding is configured as `Chi'llywood <no-reply@chillywoodstream.com>`, and hosted Supabase Auth recovery/confirmation templates are now patched/read-backed with direct app TokenHash links. A temporary SMTP-key failure was reproduced as Supabase Auth recovery `500 unexpected_failure` / `Error sending recovery email` plus Brevo SMTP `535 Authentication failed`; the Brevo SMTP key was then rotated locally, Supabase Auth SMTP was patched/read back with secrets redacted, and recovery dispatch returned `HTTP 200 {}` again. Direct Brevo smoke email delivery/open proof passed, which proved Brevo/domain/Gmail were healthy. The remaining app-path issue was the hosted Supabase Auth recovery template link: using `{{ .ConfirmationURL }}` generated a Supabase verify URL with `redirect_to=https://chillywoodstream.com`, and the user screenshot proved that landed on the public policy site. The recovery and confirmation templates now build direct `chillywoodmobile://` TokenHash links so those two flows no longer depend on Supabase's generated web redirect.

Superseding source-security note (2026-08-25): this document records historical
external proof only. Current repository templates replace the claimable custom
scheme links with exact `https://chillywoodstream.com/auth-callback` and
`https://chillywoodstream.com/reset-password` Universal/App Links. Reapplying
those templates and exact redirect allowlist in hosted Supabase, followed by
installed iOS/Android proof, is `BLOCKED_EXTERNAL`; no hosted mutation occurred
as part of the repository correction.

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
- Hosted Supabase Auth template readback now confirms:
  - recovery subject: `Reset your Chi'llywood password`
  - confirmation subject: `Confirm your Chi'llywood account`
  - recovery template contains `chillywoodmobile://reset-password?token_hash={{ .TokenHash }}&type=recovery`
  - confirmation template contains `chillywoodmobile://auth/callback?token_hash={{ .TokenHash }}&type=email`
  - recovery and confirmation templates no longer contain `{{ .ConfirmationURL }}`
  - recovery template contains correct `Chi'llywood` branding and does not contain the short misspelling.
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
  - Brevo reports the matching reset email requested at `2026-06-10T20:43:20.442-05:00` and delivered at `2026-06-10T20:43:21.000-05:00` to `rob2037gn@gmail.com`, subject `Reset Your Password`, from `no-reply@chillywoodstream.com`, with message id present. This proved app-origin Supabase Auth dispatch but also exposed that the hosted template was still stale/generic.
- Direct Brevo smoke proof:
  - proof path `/tmp/chillywood-brevo-direct-smoke-20260610-205808/`
  - SMTP accepted the message, Brevo reported requested/delivered/opened events, and the user confirmed receipt.
  - Interpretation: Brevo SMTP, sender-domain trust, and Gmail delivery were not the remaining blocker.
- Hosted Supabase Auth template correction:
  - readback proof path `/tmp/chillywood-supabase-auth-template-brand-readback-20260610-212804/`
  - old hosted recovery subject before patch: `Reset Your Password`
  - patched recovery subject: `Reset your Chi'llywood password`
  - patched confirmation subject: `Confirm your Chi'llywood account`
  - secrets and token material were redacted.
- Branded Supabase Auth recovery send:
  - proof path `/tmp/chillywood-supabase-recovery-branded-resend-20260610-213217/`
  - `POST /auth/v1/recover` returned `HTTP 200 {}`
  - Brevo reports the branded recovery email requested at `2026-06-10T21:32:19.777-05:00` and delivered at `2026-06-10T21:32:20.000-05:00` to `rob2037gn@gmail.com`, subject `Reset your Chi'llywood password`, from `no-reply@chillywoodstream.com`, with message id present.
- User screenshot proof:
  - the delivered branded email still showed a fallback Supabase verify URL with `redirect_to=https://chillywoodstream.com`.
  - tapping it opened the public policy site, not the app reset screen.
  - root cause: the template used `{{ .ConfirmationURL }}` for the button/fallback link.
- Direct TokenHash link correction:
  - hosted recovery template now uses `chillywoodmobile://reset-password?token_hash={{ .TokenHash }}&type=recovery`.
  - hosted confirmation template now uses `chillywoodmobile://auth/callback?token_hash={{ .TokenHash }}&type=email`.
  - Management API readback confirms direct app links present and `{{ .ConfirmationURL }}` absent for recovery/confirmation.
  - post-fix recovery request returned `HTTP 200 {}` at `2026-06-10T21:40:41-05:00`.
  - Brevo reports the post-fix message requested at `2026-06-10T21:40:43.604-05:00` and delivered at `2026-06-10T21:40:44.000-05:00`.

## Recipient/mail-route diagnostics

A follow-up diagnostics pass was run for recipient-side evidence:

- DNS for sender identity and protection is present:
  - `chillywoodstream.com` SPF/DMARC resolvable
  - `brevo1._domainkey.chillywoodstream.com` and `brevo2._domainkey.chillywoodstream.com` CNAMEs resolvable
- recipient domain route (`gmail.com`) is healthy by MX.
- Brevo v3 event readback is now available through local-only credentials. The redacted proof file records request and delivered events without printing credentials or raw provider payloads.

## Remaining gap

- Complete mailbox-side click-through proof from the newest Gmail message delivered after `2026-06-10T21:40:44-05:00`.
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
