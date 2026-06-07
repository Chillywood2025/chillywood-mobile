# Supabase Auth Inbox Arrival Diagnostic Pass

Date: 2026-06-07

Status: In progress – SMTP configuration and link routing are healthy; inbox arrival proof remains pending without mailbox/provider-trace credentials.

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

## Proof artifacts

- `/tmp/chillywood-inbox-arrival-diagnostics-20260607/latest_send_snapshot.txt`
- `/tmp/chillywood-inbox-arrival-diagnostics-20260607/dns_checks.txt`
- `/tmp/chillywood-inbox-arrival-diagnostics-20260607/brevo_api_probe.txt`

## Interpretation

- **Configuration side is passing**: Supabase Auth is sending recovery requests and routing is correct in app.
- **Current unresolved side**: Mailbox/provider proof (exact delivery trail + click/open state) is not yet verifiable from the current terminal environment because Brevo API credential used for tracing is not a valid REST key for the attempted endpoints.

## What to do next (non-code)

1. provide a Brevo REST API key (v3/`api-key` for the Brevo account that owns this sender) and re-run log endpoint checks,
2. verify the test inbox manually (or via Gmail API) for message receipt,
3. retry recover once and check:
   - sender is `Chi'llywood <no-reply@chillywoodstream.com>`,
   - tap opens `chillywoodmobile://reset-password`,
   - post-reset route lands on login.

## Safety and scope boundaries

No architectural behavior changed. This is diagnostics and documentation-only for the auth email pipeline. No production money, payouts, withdrawal, transfer, or LiveKit behavior was modified.
