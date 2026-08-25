# Chi'llywood Auth Email Templates

These files are the Chi'llywood-ready Supabase Auth templates for dashboard copy/paste. They do not configure SMTP by themselves and contain no credentials.

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

Use direct TokenHash HTTPS Universal/App Links for active mobile auth flows:

- Confirm signup: `https://chillywoodstream.com/auth-callback?token_hash={{ .TokenHash }}&type=email`
- Reset password: `https://chillywoodstream.com/reset-password?token_hash={{ .TokenHash }}&type=recovery`

Never place `TokenHash`, an authorization code, or session credentials in a
`chillywoodmobile://` URL. Another installed app can claim a custom scheme.
Custom-scheme auth routes are retained only for credential-free navigation.

Use `{{ .ConfirmationURL }}` for magic-link, invite, and email-change action links unless a route-specific mobile contract is implemented. Use `{{ .Token }}` only for reauthentication code templates.

## Redirects

The app currently sends:

- Confirm signup: `https://chillywoodstream.com/auth-callback`
- Reset password: `https://chillywoodstream.com/reset-password`
- Planned magic link / OTP: `https://chillywoodstream.com/auth-callback`

The HTTPS paths are already scoped by the repository's iOS AASA and Android
Digital Asset Links configuration. They must also be exact entries in Supabase
Authentication redirect settings before live email proof. Domain association,
hosted template application, and installed-device handling remain external proof.

## Sender

Recommended sender name: `Chi'llywood`

Recommended sender address: `no-reply@chillywoodstream.com` or `auth@chillywoodstream.com` after the domain has provider-approved SPF, DKIM, and DMARC.

Support footer: `support@chillywoodstream.com`
