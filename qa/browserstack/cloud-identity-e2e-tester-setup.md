# Cloud Identity E2E Tester Setup

This runbook sets up real Google-managed E2E tester accounts for Google Play
Billing sandbox and BrowserStack purchase proof. Use Cloud Identity Free first.
Do not start paid Google Workspace or enable paid Workspace licenses unless the
owner explicitly approves it.

## Account Layers

BrowserStack purchase proof uses two account layers:

- Chi'llywood app accounts sign in to the app.
- Google Play tester accounts are real Google accounts on the Android device.

The `@chillywood.test` app-login fixtures are not Google Play accounts. They
must not be used as Play Billing testers unless they are separately created as
real Google accounts, which should not be assumed.

## Access Requirements

Automation may continue only when all required access is already configured:

- Cloudflare DNS write access for `chillywoodstream.com`.
- Cloud Identity Free active for the domain.
- Google Admin Directory API or GAM user-management access.
- Play Console API access if tester-list updates will be automated.

If any Google signup, 2FA, consent screen, admin approval, or billing prompt is
shown, stop and complete that step manually in the browser. Do not start paid
Google Workspace.

## Cloudflare DNS Rules

Before adding Google verification records, export or save a local DNS backup in
the proof folder:

`/tmp/chillywood-cloud-identity-proof-YYYYMMDD-HHMMSS/cloudflare_dns_backup.json`

Allowed:

- Add the Google-provided TXT verification record.
- Re-check DNS propagation.
- Save redacted proof.

Not allowed:

- Delete existing DNS records.
- Change MX records.
- Enable Gmail.
- Modify mail routing.

## Cloud Identity Free Manual Setup

If Cloud Identity Free is not already active:

1. Open Google Cloud Identity setup in the browser.
2. Choose Cloud Identity Free.
3. Enter and verify `chillywoodstream.com`.
4. Copy the Google-provided TXT verification record.
5. Add only that TXT record in Cloudflare DNS.
6. Return to Google and complete domain verification.
7. Confirm Cloud Identity Free is active before creating users.

Do not choose a paid Google Workspace plan unless the owner explicitly approves.

## Managed Tester Accounts

Create or bulk-upload these real Google-managed users after Cloud Identity Free
is active:

- `e2e-tip@chillywoodstream.com`
- `e2e-video@chillywoodstream.com`
- `e2e-ticket@chillywoodstream.com`
- `e2e-event@chillywoodstream.com`
- `e2e-sub@chillywoodstream.com`
- `e2e-vip@chillywoodstream.com`
- `e2e-viewer7@chillywoodstream.com`
- `e2e-viewer8@chillywoodstream.com`
- `e2e-viewer9@chillywoodstream.com`
- `e2e-viewer10@chillywoodstream.com`

If automation cannot create users, prepare a local-only Google Admin bulk-upload
CSV in the proof folder. The CSV may contain generated passwords and must not be
committed. Store any local password vault file with permissions `600`.

## Play Console Tester Setup

If Play Console API automation is unavailable, use the local tester CSV from the
proof folder manually:

1. Open Play Console.
2. Go to `Setup` -> `License testing`.
3. Add the managed tester emails.
4. Go to `Testing` -> `Internal testing` or `Closed testing` -> `Testers`.
5. Create or select the tester email list.
6. Upload the CSV or paste the same tester emails.
7. Save changes.
8. Sign in as each tester and accept the internal-test opt-in link.

BrowserStack strict sandbox purchase proof requires the device Google account to
be one of these tester accounts and to be visible or otherwise verified by the
purchase-sheet safety detector.

## Chi'llywood App User Setup

After the managed Google users exist, create matching Chi'llywood app users with
the local Supabase service role from ignored env only:

- Confirm auth email as needed for E2E login.
- Create profile rows.
- Grant sandbox tester access.
- Do not grant payout authority.
- Do not enable live money.
- Do not grant LiveKit host or publish authority.

Then update only ignored local env:

`.env.browserstack-monetization.local`

Map the first six managed users to the purchase-proof viewer slots:

- Tip: `CHILLYWOOD_E2E_VIEWER_EMAIL`
- Paid Video: `CHILLYWOOD_E2E_VIEWER_02_EMAIL`
- Watch-Party Seat Pass: `CHILLYWOOD_E2E_VIEWER_03_EMAIL`
- Event Pass: `CHILLYWOOD_E2E_VIEWER_04_EMAIL`
- Platform Subscription: `CHILLYWOOD_E2E_VIEWER_05_EMAIL`
- VIP: `CHILLYWOOD_E2E_VIEWER_06_EMAIL`

Do not overwrite the owner/creator account unless a separate proof explicitly
requires it.

## Required Readback

The proof folder should include redacted logs confirming:

- Cloud Identity Free active, or manual action required.
- Verification TXT added if Google provided one.
- Users created, or bulk-upload CSV prepared.
- Play tester list updated, or manual CSV prepared.
- Local BrowserStack monetization env updated only after users exist.
- Chi'llywood app users created only after managed Google users exist.
- Sandbox tester grants active.
- Live money off.
- Payout authority false.
- No secrets printed or committed.

Current local status is manual Google-side action required unless a later proof
explicitly shows Cloud Identity Free activation and user creation.
