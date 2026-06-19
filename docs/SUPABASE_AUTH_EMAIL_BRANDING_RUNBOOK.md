# Supabase Auth Email Branding Runbook

## Purpose

Chi'llywood Auth emails should look and read like official Chi'llywood account emails, not generic provider messages. This runbook prepares the sender, templates, redirect allowlist, test plan, and rollback path for Supabase Auth email branding without committing secrets and without weakening email confirmation or password reset security.

Latest external status: `docs/SUPABASE_AUTH_SMTP_CLI_CONFIGURE_PROOF.md` and `docs/SUPABASE_AUTH_EMAIL_EXTERNAL_BRANDING_PROOF.md` record the sender branding and the current transport blocker. Supabase Auth was previously reconfigured for project `bmkkhihfbmsnnmcqkoly`, with readback confirming:

- host: `smtp-relay.brevo.com`
- sender name: `Chi'llywood`
- verified sender email: `no-reply@chillywoodstream.com`
The latest 2026-06-10 rerun first reproduced a stale SMTP-key failure (`535 Authentication failed` plus Supabase Auth recovery `500 unexpected_failure` / `Error sending recovery email`). The Brevo SMTP key was then rotated locally, Supabase Auth SMTP was patched/read back with secrets redacted, direct SMTP auth passed, and a recovery dispatch returned `200 {}`. Direct Brevo smoke email then delivered and was opened, proving Brevo/domain/Gmail delivery outside Supabase Auth. The remaining app-path issue was hosted Supabase Auth template configuration: first stale generic `Reset Your Password` recovery subject/content, then a branded template that still used `{{ .ConfirmationURL }}`. User screenshot proved that generated a Supabase verify link with `redirect_to=https://chillywoodstream.com` and opened the public policy site. The hosted recovery and confirmation templates are now patched/read-backed with `Chi'llywood` branding plus direct TokenHash app links. The app route contract is corrected. June 12 source audit proved repeated owner-inbox reset emails were triggered by Google Play automated app-access/pre-launch crawling of the forgot-password flow from Google proxy IPs; future proof must use a disposable non-admin recovery-test inbox, not the owner's personal/internal tester inbox.

June 12 App Access containment: Play Console Sign in details now uses disposable non-admin account `play-reviewer-app-access@chillywoodstream.com` instead of the owner's inbox, with the password stored only in the local macOS Keychain item `chillywood-play-reviewer-app-access`. The automated Android compatibility-testing switch for sign-in details is off and saved. If password recovery proof is repeated, use this disposable account or another approved disposable inbox, never the owner/internal tester inbox.

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

Sender name: `Chi'llywood`

Proved sender address:

- `no-reply@chillywoodstream.com`

Notes:

- Brevo sender verification is confirmed for `Chi'llywood <no-reply@chillywoodstream.com>`.
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

If DNS is managed for the `chillywoodstream.com` zone and the provider auto-appends the zone name, those hosts become `chillywood.chillywoodstream.com`, `brevo1._domainkey.chillywood.chillywoodstream.com`, `brevo2._domainkey.chillywood.chillywoodstream.com`, and `_dmarc.chillywood.chillywoodstream.com`. Those exact current Brevo hosts must resolve and authenticate before Chi'llywood can claim complete branded Auth sender deliverability.

## Supabase Dashboard Steps

1. Open Supabase Dashboard.
2. Select the Chi'llywood project.
3. Go to Authentication.
4. Open SMTP settings.
5. Enable custom SMTP.
6. Set sender name to `Chi'llywood`.
7. Set sender email to `no-reply@chillywoodstream.com` (current validated auth sender) or the approved auth sender for your approved domain path.
8. Enter SMTP host, port, username, and password from the provider.
9. Save and send a test email.
10. Do not paste or store SMTP credentials in repo docs, code, screenshots, or chat.

## Template Steps

1. Go to Authentication > Email Templates.
2. For each template, set the subject from `docs/auth-email-templates/SUBJECTS.md`.
3. Paste the matching HTML body from `docs/auth-email-templates/*.html`.
4. Paste the matching text fallback from `docs/auth-email-templates/*.txt` if the dashboard surface supports it.
5. For Confirm signup and Reset password, preserve the direct `chillywoodmobile://...token_hash={{ .TokenHash }}` app links instead of `{{ .ConfirmationURL }}`. The generated ConfirmationURL can fall back to `https://chillywoodstream.com` and land on the public policy site if the redirect is missing or rejected.
6. Preserve `{{ .ConfirmationURL }}` for other action links unless a route-specific mobile contract is explicitly implemented, and preserve `{{ .Token }}` for reauthentication codes.
7. Save one template at a time and send a test where Supabase supports it.

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

- Signup email is from `Chi'llywood`.
- Signup subject is `Confirm your Chi'llywood account`.
- Signup CTA opens the app through `chillywoodmobile://auth/callback?token_hash=...&type=email`.
- Confirmed signup returns to login or signed-in state according to app behavior.
- Forgot-password email is from `Chi'llywood` (`no-reply@chillywoodstream.com` in the current config).
- Reset subject is `Reset your Chi'llywood password`.
- Signup copy is set to `Chi'llywood`.
- Reset CTA opens `chillywoodmobile://reset-password?token_hash=...&type=recovery`.
- Reset email does not show a Supabase verify link with `redirect_to=https://chillywoodstream.com`.
- Reset success returns to login.
- Expired/invalid links show safe Chi'llywood copy.
- No raw tokens, provider payloads, SMTP credentials, or secrets appear in UI/logs.

## SMTP Key Rotation Checklist

Use this when recovery dispatch returns `Error sending recovery email` or direct SMTP auth returns `535 Authentication failed`.

1. Open Brevo dashboard for the account that owns the verified sender `no-reply@chillywoodstream.com`.
2. Go to `Settings > SMTP & API > SMTP`.
3. Create a new SMTP key. Copy it once into the local secret store only; Brevo does not show the full key again.
4. Keep the relay values unchanged unless Brevo says otherwise:
   - host: `smtp-relay.brevo.com`
   - port: `587`
   - sender email: `no-reply@chillywoodstream.com`
   - sender name: `Chi'llywood`
5. Patch Supabase Auth SMTP with the fresh SMTP key using a valid Supabase Management API token.
6. Read back Supabase Auth config with `smtp_user` and `smtp_pass` redacted.
7. Run direct SMTP auth before sending user mail.
8. Trigger `POST /auth/v1/recover` for a disposable non-admin recovery-test inbox and require `HTTP 200`. Do not use the owner's personal/internal tester inbox.
9. Tap the newest reset email on the Play/internal app runtime and prove reset-password, password update, login return, and sign-in.

Do not paste the SMTP key into docs, git, screenshots, or chat.

## Rollback

If custom SMTP breaks delivery:

1. Disable custom SMTP in Supabase.
2. Revert to the previous verified sender temporarily.
3. Keep app redirects in place.
4. Capture provider error evidence without secrets.
5. Fix DNS/SMTP settings before re-enabling.

Rollback should not disable email confirmation, bypass password reset security, or broaden redirect URLs.
