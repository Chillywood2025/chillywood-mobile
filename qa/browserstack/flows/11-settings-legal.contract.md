# 11 Settings / Legal / App Access Contract

## Purpose
Prove Settings, Privacy/Terms/Support links, account deletion flow/status, and launch governance references.

## Required Personas
- `normal_viewer`
- `play_reviewer` optional

## Required Runtime
Play/internal runtime only.

## Preconditions
- Network available for external links where needed.
- Do not expose reviewer password in artifacts.

## Steps
1. Open Settings.
2. Open Privacy Policy.
3. Open Terms.
4. Open Support.
5. Open Account Deletion flow/status.
6. Confirm links do not break auth routes.
7. Confirm App Access/reviewer account notes are documented, not exposed in-app to normal users.
8. Confirm Data Safety checklist references remain docs-only unless a public route intentionally exposes policy content.

## Expected Result
Settings and legal routes are accessible and do not leak private auth/provider state.

## Screenshots To Capture
- Settings.
- Privacy/Terms/Support route or external-open state.
- Account deletion flow/status.

## Logs To Capture
- Sanitized navigation logs only.

## Pass Criteria
- Legal/support routes open.
- Account deletion status/copy is clear.
- No token/provider secret appears.

## Fail/Blocker Criteria
- Auth links land on legal/support accidentally.
- Account deletion copy claims instant unsupported behavior.
- Reviewer credentials exposed.

## Device Count
One device.

## Google Play Purchase Required
No.

## Local Before BrowserStack
Yes.
