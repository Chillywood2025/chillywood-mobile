# Legal Launch Checklist

Last updated: May 14, 2026

> Repo launch note: Attorney review required before public launch. This checklist is the status map for repo policy drafting and external legal/setup blockers.

Status key:

- Done: implemented and verified for the release path.
- Drafted pending attorney review: policy text exists but legal approval is required.
- Linked in app: route/link exists in the app.
- Externally blocked: depends on public hosting, inbox, store console, DMCA registration, provider setup, or legal/support ownership outside repo code.
- Not implemented: no complete app/backend workflow exists.

| Item | Status | Notes |
| --- | --- | --- |
| Terms | Drafted pending attorney review / linked in app | `app/terms.tsx`; docs policy in `docs/legal/TERMS_OF_SERVICE.md`; public URL fallback exists for Terms. |
| Privacy | Drafted pending attorney review / linked in app | `app/privacy.tsx`; docs policy in `docs/legal/PRIVACY_POLICY.md`; public URL fallback exists for Privacy. |
| Creator Rules | Drafted pending attorney review / linked in app | `app/creator-rules.tsx`; Settings and Support link to it. |
| Community Guidelines | Drafted pending attorney review / linked in app | `app/community-guidelines.tsx`; docs policy created. |
| DMCA/Copyright Policy | Drafted pending attorney review / linked in app / DMCA agent registered | `app/copyright.tsx`; docs policy created; designated agent contact now uses registration number `DMCA-1072720` and `support@chillywoodstream.com`. Attorney review is still pending. |
| DMCA agent public page/contact | Done / attorney review pending | Public copyright page now lists Chi'llywood's designated agent contact: Chi'llywood Copyright Agent / Chi'llywood, `support@chillywoodstream.com`, 9316 S Kimbark, Chicago, IL 60619, phone `3124879454`. |
| Copyright Office DMCA agent registration | Done | User-provided registration truth records Chi'llywood DMCA registration number `DMCA-1072720`; public Copyright Office directory status was checked as active effective May 13, 2026. |
| Copyright report flow | Implemented / attorney review and live end-to-end proof pending | `app/copyright-report.tsx` collects formal notice fields and submits to `dmca_cases` through `submit_dmca_notice`; generic report sheet links copyright users to the formal route. |
| Counter-notice workflow | Partially implemented / attorney review pending | Admin can record counter-notices received through Support, forwarding, 10-14 business-day windows, court action notices, and restore eligibility; uploader-facing submission route remains pending. |
| Repeat infringer policy | Implemented for Admin tracking / attorney review pending | `dmca_strikes` tracks active/removed/disputed/expired strikes and can open repeat-infringer review; no automatic termination. |
| Account deletion in-app path | Linked in app / proof pending | Settings links Request Account Deletion. |
| Account deletion web link | Externally blocked / proof pending | Hosted fallback exists; final URL/process/Play acceptance pending. |
| Refund/subscription terms | Drafted pending attorney review | Policy created; RevenueCat/Google Play proof remains external. |
| Creator payout rules | Drafted pending attorney review | Payouts remain not active/live. |
| Fraud/forfeiture rules | Drafted pending attorney review | Fraud foundations exist; live enforcement not connected. |
| Sponsor disclosure rules | Drafted pending attorney review | Sponsor money/checkout remains not active. |
| Banned content policy | Drafted pending attorney review | Policy created. |
| Moderation/reporting workflow | Drafted pending attorney review / partially implemented | Generic reporting/admin moderation foundation exists; dedicated DMCA Admin tooling now exists; general report lifecycle, outbound email automation, and fraud/sponsor enforcement remain pending. |

## Required External Blockers Before Public Launch

- attorney/legal approval of Terms, Privacy, Creator Rules, Community Guidelines, Copyright/DMCA, Account Deletion, Refunds/Subscriptions, Payouts, Fraud/Forfeiture, Sponsor Disclosure, Banned Content, and Moderation workflow;
- final public URLs for Terms, Privacy, Account Deletion, Community Guidelines, Copyright/DMCA, Creator Rules, and Support as needed;
- attorney review of the public DMCA designated agent/contact language and operational workflow;
- live end-to-end DMCA proof with safe test reporter/uploader/admin accounts and no private report artifacts committed;
- keep U.S. Copyright Office DMCA agent registration current, including renewals/updates if agent contact information changes;
- support inbox receipt proof for `support@chillywoodstream.com`;
- account deletion process/SLA/backend retention runbook;
- Google Play account deletion URL acceptance and Data Safety answers;
- RevenueCat/Google Play purchase, restore, cancellation/refund/revocation proof if Premium ships live;
- live payout/sponsor/payment/fraud enforcement legal and provider approval before activating money movement.
