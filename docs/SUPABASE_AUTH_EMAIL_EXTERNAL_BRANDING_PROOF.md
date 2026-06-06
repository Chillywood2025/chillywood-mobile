# Supabase Auth Email External Branding Proof

Date: 2026-06-06

Status: custom SMTP configured and read back; mailbox-based email-delivery proof still pending.

## Scope

This proof lane confirms hosted Supabase Auth custom SMTP wiring and app-route behavior for email callbacks. It complements
`docs/SUPABASE_AUTH_SMTP_CLI_CONFIGURE_PROOF.md` and does not include marketing traffic, monetary activation, payout, or ownership changes.

## Execution Summary

- Supabase project: `bmkkhihfbmsnnmcqkoly`
- Project auth config was patched via Management API.
- SMTP host/user/sender fields were written and read back.
- Password value was never printed.
- Email callback routing was fixed so reset links do not match auth callback routing logic.
- Forgot-password request trigger was executed against the same project and accepted.

## External Configuration Status

- `PATCH /v1/projects/{ref}/config/auth` succeeded.
- `GET /v1/projects/{ref}/config/auth` confirms configured host/user/sender settings.
- `smtp_pass` was redacted from all captured outputs.

## App Callback Routing Status

- Confirm route: `chillywoodmobile://auth/callback`
- Reset route: `chillywoodmobile://reset-password`
- `app/_layout.tsx` guards now ensure `/reset-password` does not enter auth-callback flow and reaches `app/reset-password.tsx`.
- `app/auth-callback.tsx` routes to login after successful verification.

## Inbox / Click-through Status

- `POST /auth/v1/recover` was previously accepted, but current verification in this pass returns `500` with `unexpected_failure` for `rob2037gn@gmail.com`, so transport/mailbox-level confirmation is currently blocked.
- Actual mailbox receipt and manual click-through validation still requires reading the test inbox after sender trust is revalidated.
- This lane has endpoint-level routing proof; user-side click proof remains blocked until external sender-domain and mailbox trust steps are confirmed.

## Required Follow-up

- Re-run mailbox validation in the safe test inbox immediately after deploy:
  - verify reset email arrives
  - verify sender/subject and Chi'llwood template content
  - verify tap opens `chillywoodmobile://reset-password`
  - confirm successful password update returns to login

## Safety

No SMTP password, Supabase Management API token, service role key, provider secret, or local `.env` secret value was committed.
