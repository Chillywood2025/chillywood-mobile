# Supabase Auth Email External Branding Proof

Date: 2026-06-06

Status: blocked before external mutation.

## Scope

This proof lane attempted to apply the repo-ready Chi’llwood Supabase Auth email branding setup from commit `9a08385 Add Chi'llwood auth email branding templates` to the hosted Supabase project.

The intended external changes were:

- custom SMTP sender configuration
- Chi’llwood Auth email template application
- Supabase Auth redirect URL allowlist verification/application
- real branded forgot-password email proof
- real branded signup confirmation email proof
- app deep-link proof back into Chi’llwood

## Starting Repo State

Starting HEAD: `9a08385 Add Chi'llwood auth email branding templates`

Branch state: `main...origin/main`

Tracked worktree: clean at preflight.

Untracked paths present and untouched:

- `artifacts/`
- `supabase/.temp/`

Current app redirects:

- Confirm signup: `chillywoodmobile://auth/confirm`
- Reset password: `chillywoodmobile://reset-password`
- Planned auth callback: `chillywoodmobile://auth/callback`
- Legacy auth callback tolerated: `chillywoodmobile://auth-callback`

Template files present:

- `docs/auth-email-templates/confirm-signup.html`
- `docs/auth-email-templates/confirm-signup.txt`
- `docs/auth-email-templates/reset-password.html`
- `docs/auth-email-templates/reset-password.txt`
- `docs/auth-email-templates/magic-link.html`
- `docs/auth-email-templates/magic-link.txt`
- `docs/auth-email-templates/invite-user.html`
- `docs/auth-email-templates/invite-user.txt`
- `docs/auth-email-templates/email-change.html`
- `docs/auth-email-templates/email-change.txt`
- `docs/auth-email-templates/reauthentication.html`
- `docs/auth-email-templates/reauthentication.txt`
- `docs/auth-email-templates/SUBJECTS.md`
- `docs/auth-email-templates/README.md`

## Environment Preflight

The lane requires approved local environment variables before any Supabase Management API mutation.

Environment presence check, by name only:

| Variable | Status |
| --- | --- |
| `SUPABASE_ACCESS_TOKEN` | missing |
| `SUPABASE_PROJECT_REF` | missing |
| `CHILLYWOOD_AUTH_SMTP_HOST` | missing |
| `CHILLYWOOD_AUTH_SMTP_PORT` | missing |
| `CHILLYWOOD_AUTH_SMTP_USER` | missing |
| `CHILLYWOOD_AUTH_SMTP_PASS` | missing |
| `CHILLYWOOD_AUTH_SMTP_FROM` | missing |
| `CHILLYWOOD_AUTH_SMTP_SENDER_NAME` | missing |
| `CHILLYWOOD_AUTH_TEST_EMAIL` | missing |

Because `SUPABASE_ACCESS_TOKEN` and `SUPABASE_PROJECT_REF` were missing, the required read-only Management API preflight was not attempted.

Because SMTP variables were missing, no custom SMTP config was applied.

## Extended Secret Search

After the initial blocked preflight, a broader safe search checked only filenames, variable names, and Supabase secret names/digests. Secret values were not printed.

Checked locations:

- repo env files such as `.env.local`, `.env.brand-review-proof.local`, and `maestro/.env.example`
- shell profile files such as `.zshrc`, `.zprofile`, `.bash_profile`, and `.bashrc`
- `/Users/loverslane/secrets`
- `/Users/loverslane/.supabase`
- `/Users/loverslane/.config`
- Supabase Edge Function secret names for project `bmkkhihfbmsnnmcqkoly`
- shell/session cache files by variable-name presence only

Findings:

- `.env.local` contains existing app/test runtime keys, but not the required `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, or `CHILLYWOOD_AUTH_SMTP_*` variables.
- `.env.brand-review-proof.local` contains Brand Review proof account variables only.
- Supabase Edge Function secrets include `CANARY_SUPABASE_ACCESS_TOKEN` and `CANARY_SUPABASE_PROJECT_REF`, but only names/digests are available through `supabase secrets list`; values are not retrievable from the CLI and were not printed.
- Supabase Edge Function secrets do not include SMTP/mail/provider secrets such as `CHILLYWOOD_AUTH_SMTP_*`, `SMTP_*`, `RESEND_*`, `POSTMARK_*`, `SENDGRID_*`, `BREVO_*`, or `SES_*`.
- No local file matching the approved search scope exposed a Management API token or SMTP credentials for this lane.

Conclusion: the hosted canary has a Management API credential available server-side, but this lane still cannot apply external Auth email branding safely because the required local apply credentials are missing and SMTP credentials are absent both locally and from the visible Supabase secret-name inventory.

## External Setup Status

| Item | Status | Reason |
| --- | --- | --- |
| Management API read preflight | blocked | `SUPABASE_ACCESS_TOKEN` and `SUPABASE_PROJECT_REF` missing |
| Custom SMTP apply | blocked | SMTP host, port, user, password, from, and sender name missing |
| Template apply | blocked | Management API preflight unavailable |
| Redirect allowlist apply | blocked | Management API preflight unavailable |
| Real forgot-password branded email proof | blocked | custom SMTP/templates not applied; test email missing |
| Real signup confirmation branded email proof | blocked | custom SMTP/templates not applied; test email missing |
| Android deep-link proof | not rerun | app-side deep-link support was already OTA-published; external email links were unavailable |

## Required Owner Action

Provide approved environment variables in the local secret environment or approved secret store:

- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_PROJECT_REF`
- `CHILLYWOOD_AUTH_SMTP_HOST`
- `CHILLYWOOD_AUTH_SMTP_PORT`
- `CHILLYWOOD_AUTH_SMTP_USER`
- `CHILLYWOOD_AUTH_SMTP_PASS`
- `CHILLYWOOD_AUTH_SMTP_FROM`
- `CHILLYWOOD_AUTH_SMTP_SENDER_NAME`
- optional `CHILLYWOOD_AUTH_TEST_EMAIL`

Expected sender name remains `Chi’llwood`.

Preferred sender is `no-reply@chillywoodstream.com` or `auth@chillywoodstream.com`.

Support address remains `support@chillywoodstream.com`.

After the variables are available, rerun the external setup lane and capture proof under:

`/tmp/chillywood-supabase-auth-email-external-branding-proof-20260606/`

## Safety

No Supabase Management API token, SMTP password, service-role key, `.env` file, API key, provider secret, keystore, service account JSON, auth link token, or email header was committed.

No email confirmation bypass, auth security weakening, production money change, payout change, LiveKit token issuer change, or route ownership change was made.
