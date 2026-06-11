# Supabase Auth Inbox Arrival Diagnostic Pass

Date: 2026-06-07

Latest recovery check: 2026-06-10

Status: In progress – app link routing is healthy and SMTP transport is restored after Brevo SMTP key rotation. Inbox arrival and Play/internal app click-through proof remain the next checks.

## Objective

Run a final focused pass on: DNS/recipient checks, mail-route validation, latest recover send status, and proof artifact capture.

## Results (latest pass)

| Check | Command/Source | Result |
| --- | --- | --- |
| SMTP config PATCH | `PATCH /v1/projects/bmkkhihfbmsnnmcqkoly/config/auth` | 200 (configured) |
| SMTP config GET | `GET /v1/projects/bmkkhihfbmsnnmcqkoly/config/auth` | 200 (host/sender values confirmed) |
| Recover dispatch | `POST /auth/v1/recover` | 200 `{}` for `rob2037gn@gmail.com` |
| Recover dispatch timestamp | internal capture | `20260607T005540Z` |
| DNS SPF TXT | `dig +short TXT chillywoodstream.com` | `brevo-code...` + SPF TXT present |
| DNS DMARC | `dig +short TXT _dmarc.chillywoodstream.com` | DMARC TXT present |
| DNS DKIM | `dig +short CNAME brevo1._domainkey.chillywoodstream.com` and `brevo2...` | CNAME targets present |
| Recipient MX | `dig +short MX gmail.com` | Gmail MX healthy |
| Route handling | app deep-link routes | recovery points to `/reset-password`, then `/(auth)/login` |
| Provider REST telemetry | Brevo v3 with supplied credential | `401 key not found` |
| Pre-rotation direct SMTP auth | Brevo SMTP relay with stale stored SMTP key | `535 Authentication failed` |
| Pre-rotation recover dispatch | `POST /auth/v1/recover` | `500 unexpected_failure` / `Error sending recovery email` |
| Post-rotation direct SMTP auth | Brevo SMTP relay with rotated SMTP key | Pass |
| Post-rotation SMTP config patch/readback | Supabase Management API through curl | 200, secrets redacted |
| Post-rotation recover dispatch | `POST /auth/v1/recover` | 200 `{}` at `2026-06-11T01:10:42Z` |

## Proof artifacts

- `/tmp/chillywood-inbox-arrival-diagnostics-20260607/latest_send_snapshot.txt`
- `/tmp/chillywood-inbox-arrival-diagnostics-20260607/dns_checks.txt`
- `/tmp/chillywood-inbox-arrival-diagnostics-20260607/brevo_api_probe.txt`

## Interpretation

- **App route side is passing repo validation**: recovery links route to `/reset-password`, signup links route through `auth-callback`, reset success returns to login, and public policy pages are no longer treated as auth links unless they carry real auth/recovery parameters.
- **Transport side is restored**: the rotated Brevo SMTP key authenticates, Supabase Auth SMTP patch/readback succeeds, and recovery dispatch returns 200.
- **Current unresolved side**: newest-message inbox arrival and device click-through proof from the Play/internal app runtime.

## What to do next (non-code)

1. Open the newest recover email sent after `2026-06-11T01:10:42Z` and check:
   - sender is `Chi'llywood <no-reply@chillywoodstream.com>`,
   - tap opens `chillywoodmobile://reset-password`,
   - post-reset route lands on login.
2. If inbox/provider trail is still unclear after SMTP auth and recover dispatch pass, provide a Brevo REST API key with message-event access or use Gmail inbox proof.

## Safety and scope boundaries

No architectural behavior changed. This is diagnostics and documentation-only for the auth email pipeline. No production money, payouts, withdrawal, transfer, or LiveKit behavior was modified.
