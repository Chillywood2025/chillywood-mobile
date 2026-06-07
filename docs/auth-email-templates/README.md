# Chi’lywood Auth Email Templates

These files are the Chi’lywood-ready Supabase Auth templates for dashboard copy/paste. They do not configure SMTP by themselves and contain no credentials.

## Templates

| Supabase template | Subject doc | HTML | Text | Current app use |
| --- | --- | --- | --- | --- |
| Confirm signup | `SUBJECTS.md` | `confirm-signup.html` | `confirm-signup.txt` | Active |
| Reset password | `SUBJECTS.md` | `reset-password.html` | `reset-password.txt` | Active |
| Magic link / OTP | `SUBJECTS.md` | `magic-link.html` | `magic-link.txt` | Planned, no current app caller |
| Invite user | `SUBJECTS.md` | `invite-user.html` | `invite-user.txt` | Planned/admin-only if later used |
| Email change | `SUBJECTS.md` | `email-change.html` | `email-change.txt` | Planned/settings-only if later enabled |
| Reauthentication | `SUBJECTS.md` | `reauthentication.html` | `reauthentication.txt` | Planned/security-only if later enabled |

## Variables

Use `{{ .ConfirmationURL }}` for confirmation, reset, magic-link, invite, and email-change action links. Use `{{ .Token }}` only for reauthentication code templates.

## Redirects

The app currently sends:

- Confirm signup: `chillywoodmobile://auth/callback`
- Reset password: `chillywoodmobile://reset-password`
- Planned magic link / OTP: `chillywoodmobile://auth/callback`

All mobile URLs used in Auth templates must be allowlisted in Supabase Authentication redirect settings before live email proof.

## Sender

Recommended sender name: `Chi’lywood`

Recommended sender address: `no-reply@chillywoodstream.com` or `auth@chillywoodstream.com` after the domain has provider-approved SPF, DKIM, and DMARC.

Support footer: `support@chillywoodstream.com`
