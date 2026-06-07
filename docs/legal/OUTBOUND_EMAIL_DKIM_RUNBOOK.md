# Outbound Email And DKIM Runbook

Date: 2026-05-29
Lane: Store Legal Account Deletion Ops Closeout

This runbook documents the current email posture and the exact external setup required before Chi'llywood can claim outbound legal/support email reliability or complete DKIM verification. It does not contain secrets and does not claim DKIM completion.

## Current Truth

May 30, 2026 proof refresh: `/tmp/chillywood-google-play-acceptance-closeout-20260530/dns-email-check.txt` showed baseline records for `chillywoodstream.com`.

June 6, 2026 proof refresh: `/tmp/chillywood-brevo-domain-auth-smtp-proof-20260606/exact-brevo-record-checks.txt` and direct DNS checks confirm `chillywoodstream.com` SPF+DMARC are present and root-domain Brevo DKIM CNAME selectors are resolving:

- `_dmarc.chillywoodstream.com` with `p=none`
- `brevo1._domainkey.chillywoodstream.com -> b1.chillywoodstream-com.dkim.brevo.com.`
- `brevo2._domainkey.chillywoodstream.com -> b2.chillywoodstream-com.dkim.brevo.com.`
- Brevo TXT verification `brevo-code:...`

The current Brevo dashboard values supplied by the owner now ask for `chillywood` host records instead:

- TXT `chillywood` with `brevo-code:...`
- CNAME `brevo1._domainkey.chillywood -> b1.chillywood-stream-com.dkim.brevo.com`
- CNAME `brevo2._domainkey.chillywood -> b2.chillywood-stream-com.dkim.brevo.com`
- TXT `_dmarc.chillywood` with `v=DMARC1; p=none; rua=mailto:rua@dmarc.brevo.com`

If the DNS provider auto-appends the zone, these become `chillywood.chillywoodstream.com`, `brevo1._domainkey.chillywood.chillywoodstream.com`, `brevo2._domainkey.chillywood.chillywoodstream.com`, and `_dmarc.chillywood.chillywoodstream.com`. These exact names were added in Cloudflare on June 6, 2026 and now resolve from public DNS / authoritative Cloudflare nameservers.

| Item | Current status | Evidence |
| --- | --- | --- |
| Support email | `support@chillywoodstream.com` is the public support contact. | `app.config.ts`; Support/legal docs |
| Inbound routing | Cloudflare MX records exist for `chillywoodstream.com`. | `/tmp/chillywood-store-legal-account-deletion-ops-closeout-20260529/dns-email-check.txt` |
| SPF | Root TXT includes `v=spf1 include:_spf.mx.cloudflare.net ~all`. | DNS proof file |
| DMARC | `_dmarc.chillywoodstream.com` includes `v=DMARC1; p=none; rua=mailto:support@chillywoodstream.com; adkim=r; aspf=r; fo=1`. | DNS proof file |
| DKIM | Root-domain `brevo1`/`brevo2` CNAME selectors for `chillywoodstream.com` are present, and the current Brevo dashboard selectors `brevo1._domainkey.chillywood` and `brevo2._domainkey.chillywood` are also applied/resolving. | DNS proof file |
| Outbound provider | Brevo is selected for Auth SMTP; sender readback confirmed through Management API. | Redacted proof docs |
| Automated support/legal receipts | Not proved. | Current fallback is manual support email or in-app support feedback. |

June 6, 2026 Auth SMTP CLI follow-up: Supabase Auth custom SMTP is now confirmed configured for project `bmkkhihfbmsnnmcqkoly` by Management API readback with sender metadata:

- sender host: `smtp-relay.brevo.com`
- sender name: `Chi’llywood`
- verified sender email: `no-reply@chillywoodstream.com`

The same run confirms `POST /auth/v1/recover` returns HTTP `200` with `rob2037gn@gmail.com` using `chillywoodmobile://reset-password` redirect.

Inbox-level delivery and click confirmation remain pending:

- confirmed mailbox receipt for safe test inbox
- confirmed tap opens `chillywoodmobile://reset-password` with reset flow completion
- confirmed click/return behavior to login

DNS proof at `/tmp/chillywood-brevo-domain-auth-smtp-proof-20260606/cloudflare-post-create-authoritative-proof.txt` currently shows root SPF/DMARC baseline and the owner-provided Brevo `chillywood` hostnames resolving after Cloudflare DNS application.

## Outbound Use Cases

| Use case | Current status | Required before claiming automated email |
| --- | --- | --- |
| Support receipts | Manual/external fallback | Provider sender, DKIM, receipt template, test delivery proof |
| Account deletion receipt / completion notice | Manual/external fallback | Verified sender, identity-safe template, audit/ticket link, legal-approved process |
| DMCA/copyright receipts and notices | Templates and Admin/DMCA tooling exist; sending remains manual unless later automated | Provider setup, legal-approved templates, DKIM, outbound audit, delivery proof |
| Moderation notices / appeals | Manual/support path | Provider setup, operator review, audit linkage, templates |
| Provider/webhook/admin alerts | Not part of this lane | Future alerting owner and safe redaction policy |

## Recommended Sender Identity

| Field | Recommended value / rule |
| --- | --- |
| Sending domain | `chillywoodstream.com` |
| From address | Support/legal: `support@chillywoodstream.com` or a provider-approved subaddress such as `notices@chillywoodstream.com`; Supabase Auth: `no-reply@chillywoodstream.com` |
| Reply-To | `support@chillywoodstream.com` unless legal counsel specifies a separate notices inbox |
| Display name | `Chi'llywood Support` or `Chi'llywood Legal` by queue |
| Bounce handling | Provider-managed bounce/complaint handling enabled |
| Secret storage | Provider console, Supabase secrets, EAS secrets, or deployment secret store only. Never commit to repo. |

## Environment Variable Names Only

Use provider-specific names only after a provider is selected. Do not store values in docs or source.

Possible generic names:

- `OUTBOUND_EMAIL_PROVIDER`
- `SUPPORT_FROM_EMAIL`
- `SUPPORT_REPLY_TO_EMAIL`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USERNAME`
- `SMTP_PASSWORD`
- `EMAIL_PROVIDER_API_KEY`
- `EMAIL_WEBHOOK_SECRET`
- `DKIM_SELECTOR`

These names are placeholders for planning. They are not proof that a provider is configured.

## DKIM Setup Checklist

| Step | Owner | Proof to save outside repo | Status |
| --- | --- | --- | --- |
| Select outbound provider | Owner/Admin | Provider name and account/project reference without secrets | Pending |
| Verify sending domain | Owner/Admin or email operator | Provider screenshot/redacted verification receipt | Pending |
| Publish SPF update if provider requires one | DNS operator | DNS TXT proof with no secrets | Pending |
| Publish DKIM TXT/CNAME records | DNS operator | Provider DKIM status screenshot plus `dig`/DNS proof | Applied/resolving for exact current Brevo `chillywood` hosts; Brevo dashboard refresh still needs confirmation |
| Keep DMARC report address monitored | Owner/Admin | DMARC aggregate receipt or provider dashboard proof | Pending |
| Send test support email | Support operator | Redacted delivery screenshot/header summary, no private content | Pending |
| Send test account-deletion receipt if automation exists | Support operator | Redacted test ticket/proof | Pending |
| Send test DMCA receipt if automation exists | Legal/DMCA operator | Redacted test case/proof | Pending |
| Configure bounce/complaint handling | Email operator | Provider dashboard proof | Pending |
| Define rollback/disable plan | Owner/Admin | Short runbook entry | Pending |

## Rollback / Disable Plan

If automated outbound email misbehaves:

1. Disable the provider secret or feature flag in server configuration.
2. Fall back to manual responses from `support@chillywoodstream.com`.
3. Preserve affected message ids and operator notes.
4. Review templates for private data, legal wording, and wrong-recipient risk.
5. Re-enable only after a successful test send and owner approval.

## Launch Classification

- Controlled Android testing: acceptable with manual support email and no automated-email claims.
- Broad public launch: P1 external ops until outbound provider, DKIM, delivery, bounce handling, and operator ownership are proved.
- Play/legal/account-deletion: do not claim automated notices, DKIM, or guaranteed receipt until proof exists.
