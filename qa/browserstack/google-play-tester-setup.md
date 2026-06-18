# Google Play Tester Setup

BrowserStack purchase proof has two separate account layers:

- Chi'llwood E2E app accounts log into the Chi'llwood app.
- Google Play tester accounts are real Google accounts on the Android device.

The `@chillywood.test` E2E accounts are app-login fixtures only. They are not Google Play tester accounts unless separately created as real Google accounts, which should not be assumed.

## Local Tester CSV

Prepare the local-only tester CSV from ignored env/proof data:

`/tmp/chillywood-google-play-testers/google-play-testers.csv`

For Cloud Identity managed tester accounts, use the Cloud Identity proof folder
CSV instead:

`/tmp/chillywood-cloud-identity-proof-YYYYMMDD-HHMMSS/google_play_testers.csv`

Rules:

- Include only real Google/Gmail tester emails that are explicitly configured locally.
- Do not include passwords.
- Do not commit the CSV unless it contains no private emails and the user explicitly approves.
- Keep the redacted report in the same proof folder for audit.

## Manual Play Console Steps

Codex does not update Play Console unless explicit Google Play Console automation/API credentials are configured and approved.

1. Open Google Play Console.
2. Go to `Setup` -> `License testing`.
3. Add the real Gmail tester accounts from the local CSV.
4. Go to `Testing` -> `Internal testing` -> `Testers`.
5. Create or select the tester email list.
6. Upload the CSV or paste the email list.
7. Save changes.
8. Send or open the internal test opt-in link.
9. Make sure each tester opts in before BrowserStack purchase proof.

If Cloud Identity Free is not active yet, complete
`qa/browserstack/cloud-identity-e2e-tester-setup.md` first so the tester
emails are real Google-managed accounts for the Chi'llwood domain.

## BrowserStack Purchase Proof Requirement

BrowserStack/Google Play purchase proof requires the BrowserStack Android device to use a Google account that is on the Play Console license-testing/internal-testing tester list.

If the BrowserStack device Google account is missing, unknown, not visible on the Play sheet, or not on the tester list, strict sandbox auto-confirm must stop with `HUMAN_REQUIRED_GOOGLE_PLAY_CONFIRMATION` or fail closed according to the purchase safety policy.

## Current Status

Status is `tester CSV prepared; manual Play Console add required` unless a later proof explicitly shows that Play Console was updated.
