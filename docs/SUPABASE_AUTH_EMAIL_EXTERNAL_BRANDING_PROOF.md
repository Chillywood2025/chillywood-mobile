# Supabase Auth Email External Branding Proof

Date: 2026-06-06

Status: custom SMTP configured and read back; API-level recovery dispatch accepted; exact Brevo DNS host records and mailbox click proof pending.

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
- Current Brevo dashboard records were rechecked against public DNS using the exact owner-provided hostnames.

## External Configuration Status

- `PATCH /v1/projects/{ref}/config/auth` succeeded.
- `GET /v1/projects/{ref}/config/auth` confirms configured host/user/sender settings.
- `smtp_pass` was redacted from all captured outputs.
- Sender remains `Chi'llwood <no-reply@chillywoodstream.com>` through `smtp-relay.brevo.com`.

## Brevo DNS Status

Owner-provided Brevo dashboard values on June 6, 2026:

| Record | Brevo host | Expected full DNS name if the zone auto-appends `chillywoodstream.com` | Public DNS result |
| --- | --- | --- | --- |
| Brevo code TXT | `chillywood` | `chillywood.chillywoodstream.com` | Not resolving |
| DKIM 1 CNAME | `brevo1._domainkey.chillywood` | `brevo1._domainkey.chillywood.chillywoodstream.com` | Not resolving |
| DKIM 2 CNAME | `brevo2._domainkey.chillywood` | `brevo2._domainkey.chillywood.chillywoodstream.com` | Not resolving |
| DMARC TXT | `_dmarc.chillywood` | `_dmarc.chillywood.chillywoodstream.com` | Not resolving |

Existing root-domain Brevo records are visible at `chillywoodstream.com`, `brevo1._domainkey.chillywoodstream.com`, and `brevo2._domainkey.chillywoodstream.com`, but those do not match the exact current Brevo dashboard hosts above. DNS-provider API variables were not available in this shell, so this pass documents the exact records to apply rather than claiming they were added.

## App Callback Routing Status

- Confirm route: `chillywoodmobile://auth/callback`
- Reset route: `chillywoodmobile://reset-password`
- `app/_layout.tsx` now excludes `type=recovery` links and `/auth/v1/verify` recovery links from auth-callback flow so they reach `app/reset-password.tsx`.
- Generic confirmation `code` links are not treated as password recovery by themselves, so signup confirmation remains on the auth-callback-to-login path.
- `app/auth-callback.tsx` routes to login after successful verification.

## Inbox / Click-through Status

- `POST /auth/v1/recover` now returns `200` for `rob2037gn@gmail.com`, so API-level dispatch is accepted.
- Mailbox-level confirmation is still pending: verify delivery from `no-reply@chillywoodstream.com`, tap behavior to `chillywoodmobile://reset-password`, and post-reset return to login.
- Actual mailbox receipt and manual click-through validation still requires reading the test inbox after the exact Brevo dashboard DNS records authenticate.
- This lane has endpoint-level routing proof and accepted dispatch proof plus recovery-route correction proof; user-side click proof remains pending until safe inbox verification confirms sender/subject/content and route behavior.

## Required Follow-up

- Re-run mailbox validation in the safe test inbox immediately after deploy:
  - add the exact current Brevo DNS records if Brevo still shows them as pending
  - verify reset email arrives
  - verify sender/subject and Chi'llwood template content
  - verify tap opens `chillywoodmobile://reset-password`
  - confirm successful password update returns to login

## Safety

No SMTP password, Supabase Management API token, service role key, provider secret, or local `.env` secret value was committed.
