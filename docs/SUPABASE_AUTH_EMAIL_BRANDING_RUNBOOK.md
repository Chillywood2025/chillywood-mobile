# Supabase Auth Email Branding Runbook

## Purpose

Chi’llwood Auth emails should look and read like official Chi’llwood account emails, not generic provider messages. This runbook prepares the sender, templates, redirect allowlist, test plan, and rollback path for Supabase Auth email branding without committing secrets and without weakening email confirmation or password reset security.

Latest external status: `docs/SUPABASE_AUTH_SMTP_CLI_CONFIGURE_PROOF.md` and `docs/SUPABASE_AUTH_EMAIL_EXTERNAL_BRANDING_PROOF.md` record successful Supabase Auth SMTP reconfiguration for project `bmkkhihfbmsnnmcqkoly`, with readback confirming:

- host: `smtp-relay.brevo.com`
- sender name: `Chi’llwood`
- sender email: `no-reply@chillywoodstream.com`
- `POST /auth/v1/recover` for `rob2037gn@gmail.com` now returns `200`

This is account email only. It is not marketing email, newsletter email, production money activation, payout activation, LiveKit work, or a replacement for Supabase Auth.

## Current App Redirect Map

| Auth action | App call | Redirect |
| --- | --- | --- |
| Confirm signup | `supabase.auth.signUp` in `app/(auth)/signup.tsx` | `chillywoodmobile://auth/callback` |
| Reset password | `supabase.auth.resetPasswordForEmail` in `app/(auth)/login.tsx` | `chillywoodmobile://reset-password` |
| Magic link / OTP | No current app caller | Planned: `chillywoodmobile://auth/callback` |
| Invite user | No current app caller | Use `chillywoodmobile://auth/callback` or onboarding route after product approval |
| Email change | No current app caller | Use `chillywoodmobile://auth/callback` or settings confirmation route after product approval |

`app/_layout.tsx` routes `chillywoodmobile://reset-password`, `chillywoodmobile://auth/callback`, `chillywoodmobile://auth/confirm`, and legacy `chillywoodmobile://auth-callback` into safe app screens. Token-like params are stripped from route analytics.

## Sender Recommendation

Sender name: `Chi’llwood`

Proved sender address:

- `no-reply@chillywoodstream.com`

Notes:

- `no-reply@auth.chillywoodstream.com` can be used only after separate verified sender setup and DNS allowlist for that subdomain.

Support address: `support@chillywoodstream.com`

For operational fallback routing and audit channels, `auth@chillywoodstream.com` is documented as a reserved auth/contact alias and must remain configured only if provider/domain allowlists and DNS are explicitly updated before production use.

Do not use the support inbox as the SMTP credential account unless the provider requires it. Keep auth transactional email separate from marketing email.

## SMTP Provider Options

Good production-ready options include:

- Resend
- Postmark
- AWS SES
- SendGrid
- Brevo

Choose one provider, verify `chillywoodstream.com`, and keep SMTP secrets outside git. Supabase default SMTP is appropriate for development/proof only and should not be treated as production-ready sender branding.

## DNS Requirements

Before switching on custom SMTP:

- SPF includes the outbound provider.
- DKIM selector records are published and verified.
- DMARC exists for `chillywoodstream.com`.
- Bounce/complaint handling is understood for the provider.
- Sender address is verified in the provider and in Supabase SMTP settings.

Current repo truth already records support inbox routing and DMARC baseline. Brevo selector records are present for `chillywoodstream.com` as CNAMEs:

- `brevo1._domainkey.chillywoodstream.com`
- `brevo2._domainkey.chillywoodstream.com`

Current Brevo dashboard truth from June 6, 2026 asks for exact host records under `chillywood`:

- TXT `chillywood`
- CNAME `brevo1._domainkey.chillywood`
- CNAME `brevo2._domainkey.chillywood`
- TXT `_dmarc.chillywood`

If DNS is managed for the `chillywoodstream.com` zone and the provider auto-appends the zone name, those hosts become `chillywood.chillywoodstream.com`, `brevo1._domainkey.chillywood.chillywoodstream.com`, `brevo2._domainkey.chillywood.chillywoodstream.com`, and `_dmarc.chillywood.chillywoodstream.com`. Those exact current Brevo hosts must resolve and authenticate before Chi'llwood can claim complete branded Auth sender deliverability.

## Supabase Dashboard Steps

1. Open Supabase Dashboard.
2. Select the Chi’llwood project.
3. Go to Authentication.
4. Open SMTP settings.
5. Enable custom SMTP.
6. Set sender name to `Chi’llwood`.
7. Set sender email to `no-reply@chillywoodstream.com` (current validated auth sender) or the approved auth sender for your approved domain path.
8. Enter SMTP host, port, username, and password from the provider.
9. Save and send a test email.
10. Do not paste or store SMTP credentials in repo docs, code, screenshots, or chat.

## Template Steps

1. Go to Authentication > Email Templates.
2. For each template, set the subject from `docs/auth-email-templates/SUBJECTS.md`.
3. Paste the matching HTML body from `docs/auth-email-templates/*.html`.
4. Paste the matching text fallback from `docs/auth-email-templates/*.txt` if the dashboard surface supports it.
5. Preserve `{{ .ConfirmationURL }}` for action links and `{{ .Token }}` for reauthentication codes.
6. Save one template at a time and send a test where Supabase supports it.

## Redirect Allowlist

Supabase Authentication redirect URLs must include:

- `chillywoodmobile://auth/callback`
- `chillywoodmobile://auth/confirm`
- `chillywoodmobile://auth-callback` while legacy links are still tolerated
- `chillywoodmobile://reset-password`
- official web fallback URL if needed, such as `https://chillywoodstream.com`
- local dev URLs only when actively needed for development

Avoid broad wildcards unless explicitly approved. If a verification email lands on a policy page, the likely causes are missing `emailRedirectTo` in the app call, missing allowlist entry, or a Site URL fallback.

## Management API Example

Use placeholders only:

```bash
curl -H "Authorization: Bearer $SUPABASE_MANAGEMENT_TOKEN" \
  "https://api.supabase.com/v1/projects/$PROJECT_REF/config/auth"
```

Do not commit `$SUPABASE_MANAGEMENT_TOKEN`, SMTP credentials, service-role keys, or provider secrets.

## Test Checklist

- Signup email is from `Chi’llwood`.
- Signup subject is `Confirm your Chi’llwood account`.
- Signup CTA opens the app through `chillywoodmobile://auth/callback`.
- Confirmed signup returns to login or signed-in state according to app behavior.
- Forgot-password email is from `Chi’llwood` (`no-reply@chillywoodstream.com` in the current config).
- Reset subject is `Reset your Chi’llwood password`.
- Reset CTA opens `chillywoodmobile://reset-password`.
- Reset success returns to login.
- Expired/invalid links show safe Chi’llwood copy.
- No raw tokens, provider payloads, SMTP credentials, or secrets appear in UI/logs.

## Rollback

If custom SMTP breaks delivery:

1. Disable custom SMTP in Supabase.
2. Revert to the previous verified sender temporarily.
3. Keep app redirects in place.
4. Capture provider error evidence without secrets.
5. Fix DNS/SMTP settings before re-enabling.

Rollback should not disable email confirmation, bypass password reset security, or broaden redirect URLs.
