# Supabase Auth Email External Branding Proof

Date: 2026-06-07

Status: Callback routing is now fixed for recovery links, sender branding is configured (`Chi'llywood <no-reply@chillywoodstream.com>`), and recovery dispatch succeeds. This pass adds explicit inbox-arrival diagnostics for recipient-side and mail-route evidence.

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

- `POST /auth/v1/recover` for `rob2037gn@gmail.com` returns `HTTP 200` with `{}`.
- latest send timestamp: `20260607T005540Z`.
- this indicates API dispatch is healthy.

## Recipient/mail-route diagnostics

A follow-up diagnostics pass was run for recipient-side evidence:

- DNS for sender identity and protection is present:
  - `chillywoodstream.com` SPF/DMARC resolvable
  - `brevo1._domainkey.chillywoodstream.com` and `brevo2._domainkey.chillywoodstream.com` CNAMEs resolvable
- recipient domain route (`gmail.com`) is healthy by MX.
- Brevo v3 API endpoints were attempted with the supplied credential, but returned `401 Key not found`; the key appears to be an SMTP credential rather than a REST API key, so delivery trail (sent/delivered/opened events) could not be pulled in this lane.

## Remaining gap

- We still need mailbox-side confirmation in the actual safe inbox because inbound/provider telemetry could not be queried with current keys.

## Next step

Capture one fresh recover email in the safe inbox and verify:

1. sender and subject
2. reset link opens reset screen
3. successful reset returns to login
4. no signup-policy route intercepts recovery links

## Safety

No SMTP/API secret, Supabase token, service-role key, `.env` secret, keystore, or service account file was committed. No secret values were added to docs.
