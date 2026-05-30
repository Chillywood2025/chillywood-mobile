# Outbound Email And DKIM Runbook

Date: 2026-05-29
Lane: Store Legal Account Deletion Ops Closeout

This runbook documents the current email posture and the exact external setup required before Chi'llywood can claim outbound legal/support email reliability or complete DKIM verification. It does not contain secrets and does not claim DKIM completion.

## Current Truth

May 30, 2026 proof refresh: `/tmp/chillywood-google-play-acceptance-closeout-20260530/dns-email-check.txt` again shows Cloudflare MX, SPF, and DMARC baseline records for `chillywoodstream.com`; common selectors `default`, `google`, `selector1`, `selector2`, `mail`, and `k1` returned no DKIM TXT record. DKIM remains external/unverified.

| Item | Current status | Evidence |
| --- | --- | --- |
| Support email | `support@chillywoodstream.com` is the public support contact. | `app.config.ts`; Support/legal docs |
| Inbound routing | Cloudflare MX records exist for `chillywoodstream.com`. | `/tmp/chillywood-store-legal-account-deletion-ops-closeout-20260529/dns-email-check.txt` |
| SPF | Root TXT includes `v=spf1 include:_spf.mx.cloudflare.net ~all`. | DNS proof file |
| DMARC | `_dmarc.chillywoodstream.com` includes `v=DMARC1; p=none; rua=mailto:support@chillywoodstream.com; adkim=r; aspf=r; fo=1`. | DNS proof file |
| DKIM | Common selectors checked from public DNS returned no DKIM TXT/CNAME record. | DNS proof file |
| Outbound provider | Not selected/proved by repo evidence. | No provider keys or DKIM records are committed or printed. |
| Automated support/legal receipts | Not proved. | Current fallback is manual support email or in-app support feedback. |

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
| From address | `support@chillywoodstream.com` or a provider-approved subaddress such as `notices@chillywoodstream.com` |
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
| Publish DKIM TXT/CNAME records | DNS operator | Provider DKIM status screenshot plus `dig`/DNS proof | Pending |
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
