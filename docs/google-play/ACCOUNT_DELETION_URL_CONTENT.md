# Account Deletion URL Content Package

Date: 2026-05-30
Status: public URL candidate live; Play acceptance still external

Current public URL candidate:

`https://chillywoodstream.com/account-deletion`

Current proof:

- HTTP 200 after redirect in `/tmp/chillywood-google-play-acceptance-closeout-20260530/public-url-check.tsv`
- Android in-app Account Deletion policy proof in `/tmp/chillywood-google-play-acceptance-closeout-20260530/android/08-account-deletion.png`

Do not mark this complete until Google Play accepts the Data deletion/account deletion entry and the owner/legal operator approves the deletion process.

## Required Public Page Content

The public account deletion page should keep the following points prominent and easy to find:

1. App/developer name: Chi'llywood.
2. A clear path to request deletion without reinstalling the app.
3. A support contact: `support@chillywoodstream.com`.
4. What account data is deleted or de-identified.
5. What may be retained and why.
6. Expected response/fulfillment timing.
7. Identity verification expectations.
8. Subscription/Premium handling.
9. Legal/safety/moderation/copyright retention exceptions.

## Owner-Approved Copy Candidate

Use this as the exact owner/operator checklist for the hosted page and Play Console evidence. Legal approval is still required before public launch.

```text
Request Chi'llywood account deletion

Chi'llywood users can request deletion of their app account and associated account data.

How to request deletion:

1. In the app, open Settings > Legal and Support > Account Deletion and Data Deletion Policy.
2. Use the Support path or email support@chillywoodstream.com from the email address associated with your account.
3. If you cannot access the app, email support@chillywoodstream.com with the subject "Account deletion request" and include the username or email address associated with the Chi'llywood account.

What Chi'llywood deletes or de-identifies:

- account profile identity where deletion is approved;
- public profile fields, profile photo/background, and user-owned profile data where legally and technically permitted;
- account-linked app activity where retention is not required;
- push tokens and device notification records where backed;
- user-owned posts, comments, uploads, attachments, and creator content according to the final approved deletion/de-identification runbook.

What may be retained:

Chi'llywood may retain records needed for security, fraud prevention, abuse prevention, moderation, legal compliance, copyright/DMCA handling, tax/billing/payment disputes, chargebacks, audit logs, backups, and safety investigations. Retained records may be limited, de-identified, or access-restricted where possible.

Timing:

Chi'llywood will acknowledge account deletion requests after the support owner verifies the request path. The final public SLA must be set by the owner/legal operator before launch. Do not claim a faster or automated deletion timeline unless the process is staffed and proved.

Subscriptions:

If you purchased Premium through Google Play, cancel/manage the subscription through Google Play as well. Account deletion does not automatically cancel every external subscription or payment-provider record.

Verification:

Chi'llywood may require proof that the requester controls the account before deleting or de-identifying data.
```

## In-App Status

| Item | Status | Evidence |
| --- | --- | --- |
| Settings path | Reachable | Android proof `01-settings.png` through `05-account-support-links.png` |
| Account deletion policy route | Reachable | Android proof `08-account-deletion.png` |
| Support path | Route exists; current direct deep link did not open support during this proof and prior release proof remains the visual support reference | `components/system/support-screen.tsx`; earlier screenshot path `/tmp/chillywood-public-v1-eight-blocker-burndown-20260529/` |
| Destructive deletion | Not claimed | Current flow is request-based |
| Admin/support processing | Manual/ops mapped | `docs/legal/STORE_LEGAL_ACCOUNT_DELETION_ACCEPTANCE_CLOSEOUT.md` |

## Play Console Entry

Use the final approved URL:

`https://chillywoodstream.com/account-deletion`

Then save proof outside the repo:

- Play Console Data deletion/account deletion page screenshot;
- accepted URL status;
- exact date/time;
- reviewer notes if Google returns issues.

## Remaining External P0

The P0 remains open until:

1. Play Console accepts the account deletion URL and Data deletion answers.
2. The owner/legal operator approves the public SLA and deletion/de-identification runbook.
3. Support staffing and identity-verification ownership are confirmed.
