# Legal Launch Checklist

Last updated: May 29, 2026

> Repo launch note: Attorney review required before public launch. This checklist is the status map for repo policy drafting and external legal/setup blockers.

## May 29, 2026 Public V1 Burn-Down Proof

Public V1 eight-blocker burn-down proof lives at `/tmp/chillywood-public-v1-eight-blocker-burndown-20260529/`. The release APK installed and opened on Android device `R5CR120QCBF`, in-app Settings/Support/Account Deletion/Privacy/Terms/Copyright Report/Moderation Policy routes were captured, and public legal/support URLs returned HTTP 200 after redirects where applicable. This closes the current repo/runtime proof that the legal surfaces are reachable, but it does not complete attorney approval, Google Play Data Safety/content-rating/listing entry, account deletion URL acceptance, support/account-deletion SLA ownership, or external legal operations acceptance.

## May 29, 2026 Moderation/Legal Ops Blocker 8 Follow-Up

Blocker 8 is no longer blocked on missing repo-side moderation tooling. Safety report intake is backed by `safety_reports`, client insert guards, and the contextual report sheet. Admin report review is backed by `read_admin_reports`, `update_admin_report_status`, `apply_admin_report_target_action`, and `list_admin_report_audit_events`, with immutable `platform_admin_audit_logs` rows for status and target actions. Backed target actions cover creator videos, profile posts, profile post comments, creator-video comments, social attachments, and Profile media. Profile Photo/Profile Background reports are reachable from the Profile Actions sheet when media exists, and profile media target actions set `flagged`, `admin_removed`, or `active` while public profile reads mask non-active media.

Proof for this follow-up is recorded at `/tmp/chillywood-blocker8-moderation-legal-closeout-20260529/`, and the current release screenshots in `/tmp/chillywood-public-v1-eight-blocker-burndown-20260529/` remain the visual proof for Support, Account Deletion, Copyright Report, Moderation Policy, Admin Reports, Privacy, and Terms.

Remaining launch blockers are external/operational: attorney approval, Google Play policy acceptance, support/account-deletion SLA ownership, externalized outbound notice/receipt reliability, and an optional disposable-fixture visual drill for a full general report lifecycle. Production ClamAV worker deployment/runtime proof is now closed. Do not fake reports or create real moderation rows without a safe disposable target.

## May 29, 2026 Store Legal Account Deletion Ops Closeout

Closeout doc: `docs/legal/STORE_LEGAL_ACCOUNT_DELETION_ACCEPTANCE_CLOSEOUT.md`.

Repo-side legal/support/account-deletion reachability is current:

- public legal URLs returned HTTP 200 after redirects for Privacy, Terms, Account Deletion, Copyright, Copyright Report, Support, Community Guidelines, Creator Rules, Moderation Policy, and Premium Terms;
- Android release proof still covers Settings, Support, Account Deletion, Copyright Report, Moderation Policy, Admin Reports, Privacy, and Terms;
- account deletion is an honest self-service scheduled deletion flow with a 30-day restore window and does not claim permanent destructive purge completion until the backend job/runbook is proved;
- support/moderation/account deletion operational roles and SLA targets are mapped, but staffing/owner acceptance remains external;
- outbound email/DKIM is partially complete. Cloudflare MX, SPF, and DMARC baseline exist. `chillywoodstream.com` Brevo DKIM selectors are present, and Supabase Auth custom SMTP is configured (`no-reply@chillywoodstream.com`, `smtp-relay.brevo.com`) with Management API readback verified. Provider mailbox delivery/click proof remains pending, and no production-wide automated outbound notice stack is fully claimed yet.
- repo-side malware scanning is implemented, production-deployed, runtime-proved, and Admin-reviewable;
- optional disposable report lifecycle visual proof remains fixture-blocked and must not be faked.

Supporting docs:

- `docs/legal/OUTBOUND_EMAIL_DKIM_RUNBOOK.md`
- `docs/security/MALWARE_SCANNING_READINESS_PLAN.md`

## May 30, 2026 Google Play Execution Package

The repo-side Play Console package is complete and does not claim external acceptance:

- `docs/google-play/PLAY_CONSOLE_EXECUTION_CHECKLIST.md`
- `docs/google-play/DATA_SAFETY_EVIDENCE_MAP.md`
- `docs/google-play/ACCOUNT_DELETION_URL_CONTENT.md`
- `docs/google-play/REVIEWER_ACCESS_INSTRUCTIONS.md`
- `docs/google-play/STORE_LISTING_ASSET_CHECKLIST.md`

June 1, 2026 update: `docs/google-play/EXTERNAL_ACCEPTANCE_TRACKER.md` is now the field-level tracker for the remaining Play Console P0. It documents that App Content, Data Safety, Content Rating, Account deletion, App access, Store listing assets, and AAB/upload readiness remain external unless Play Console proof is supplied. No Play submission, account deletion acceptance, content rating receipt, Data Safety submission, store listing acceptance, production release, or legal approval is claimed from repo evidence.

Proof folder: `/tmp/chillywood-google-play-acceptance-closeout-20260530/`.

Current URL proof returns HTTP 200 after redirects for Privacy, Terms, Account Deletion, Copyright, Copyright Report, Support, Moderation Policy, Community Guidelines, and Creator Rules. Android proof captures Settings Legal and Support, Privacy, Terms, Account Deletion, Copyright Report, and Moderation Policy. Direct Support deep-link proof did not resolve in this run, so the May 29 release proof remains the current Support visual proof until the next route smoke.

Production malware scanning is now closed: the ClamAV worker is deployed on `chillywood-prod-01`, benign and EICAR runtime proof passed, public gates fail closed, and Admin scanner review is sanitized. Play/Data Safety/content-rating/account-deletion acceptance, legal approval, account deletion fulfillment, and support staffing remain external; outbound delivery automation remains proof-limited to authenticated auth flows until safe inbox-click verification is complete.

## May 21, 2026 Production Legal Policy Source

Canonical mobile/static policy text now lives in `legal/policies.mjs` and is rendered by:

- mobile bundled policy viewer: `components/legal/legal-policy-viewer.tsx`
- Settings launcher: `app/settings.tsx`
- public static site build: `public-site/legal-site/build.mjs`
- Admin Canary legal readiness checks: `supabase/functions/admin-owner-controls/index.ts`

Attorney review is still required before public launch. The repo now contains full production-draft text for 12 policy pages, each over 1,500 words:

- Privacy Policy: 2,022 words
- Terms of Use: 1,843 words
- Community Guidelines: 1,744 words
- Creator Rules and Creator Terms: 1,835 words
- Copyright and DMCA Policy: 1,831 words
- Support and Account Help: 1,695 words
- Account Deletion and Data Deletion Policy: 1,914 words
- Premium and Subscription Terms: 1,588 words
- Live, Watch-Party, and Chat Rules: 1,582 words
- Law Enforcement and Legal Request Policy: 1,582 words
- Content Moderation, Enforcement, and Appeals Policy: 1,500 words
- Creator Monetization and Revenue Disclaimer Policy: 1,520 words

Required creator acknowledgements now live with the same source:

- `CREATOR_UPLOAD_ACKNOWLEDGEMENT`
- `LIVE_REPLAY_ACKNOWLEDGEMENT`

These are wired into Studio upload/publish and live/replay event save paths in `app/channel-settings.tsx`.

May 21 production legal proof: `admin-owner-controls` ACTIVE version 10 ran Admin Canary from physical Android owner device `R5CR120QCBF` and returned `33 pass`, `0 manual`, and `0 failed`. Legal readiness checks passed for policy word counts, creator license clause, upload acknowledgement, live/replay acknowledgement, prohibited ownership/no-license phrases, Google Play deletion language, DMCA checklist, support email/path, and public-link-or-bundled fallback.

May 22 DMCA public/legal pipeline closeout proof: `admin-owner-controls` ACTIVE version 15 ran the release-device canary from physical Android owner device `R5CR120QCBF` and returned `60 pass`, `0 manual_required`, and `0 failed`. The canonical hosted URL `https://chillywoodstream.com/copyright-report` is configured, linked from Settings Legal & Support and public legal pages, and the public form creates real DMCA cases through anon `submit_dmca_notice` with private evidence attachment upload, Admin readback, anonymous evidence download denial, and test-case cleanup.

May 22 Legal Intake / Legal Evidence closeout proof: `admin-owner-controls` ACTIVE version 20 and `admin-legal-evidence` ACTIVE version 7 ran the release-device canary from physical Android owner device `R5CR120QCBF` and returned `65 pass`, `0 manual_required`, and `0 failed`. The Admin surface now has one top-level Legal tab with Intake, Evidence, Holds, Requests, Exports, and Timeline/History sub-sections. Legal request list/create/open/status/timeline/evidence linkage, owner normal no-reason Legal Intake, scoped Admin preview/export/hold permissions, ungranted Admin/moderator/viewer server-side denial, target coverage, and proof grant cleanup are backed and proved.

Status key:

- Done: implemented and verified for the release path.
- Drafted pending attorney review: policy text exists but legal approval is required.
- Linked in app: route/link exists in the app.
- Externally blocked: depends on public hosting, inbox, store console, DMCA registration, provider setup, or legal/support ownership outside repo code.
- Not implemented: no complete app/backend workflow exists.

| Item | Status | Notes |
| --- | --- | --- |
| Terms | Full production draft pending attorney review / linked in app | `app/terms.tsx` renders `legal/policies.mjs`; public static output generated by `npm run legal-site:build`. |
| Privacy | Full production draft pending attorney review / linked in app | `app/privacy.tsx` renders `legal/policies.mjs`; public static output generated by `npm run legal-site:build`. |
| Creator Rules | Full production draft pending attorney review / linked in app | `app/creator-rules.tsx`; includes creator ownership retention, broad service license, rights responsibility, no automatic payment, deletion/retention, upload acknowledgement, and live/replay acknowledgement. |
| Community Guidelines | Full production draft pending attorney review / linked in app | `app/community-guidelines.tsx`; covers harassment, threats, hate, child safety, sexual content, violence, self-harm, illegal activity, scams, impersonation, spam, doxxing, copyright, live/chat, reporting, enforcement, and appeals. |
| DMCA/Copyright Policy | Full production draft pending attorney review / linked in app / DMCA agent registered | `app/copyright.tsx`; designated agent contact still uses registration number `DMCA-1072720` and `support@chillywoodstream.com`; includes takedown, counter-notice, repeat infringer, preservation, appeals, and launch checklist. |
| Support & Account Help | Full production draft pending attorney review / linked in app | `app/support-policy.tsx`; Settings also keeps a separate Contact Support action to the existing support workflow. |
| Premium / Subscription Terms | Full production draft pending attorney review / linked in app | `app/premium-terms.tsx`; covers RevenueCat/store entitlement truth for normal users and owner platform access exception. |
| Live / Watch-Party / Chat Rules | Full production draft pending attorney review / linked in app | `app/live-rules.tsx`; covers hosts, speakers, camera/mic consent, saved replays, moderation, privacy, chat/call limits, and no uninterrupted-live guarantee. |
| Law Enforcement / Legal Requests | Full production draft pending attorney review / linked in app / Admin Legal workflow live-proof passed | `app/law-enforcement.tsx`; covers preservation, legal holds, subpoenas/warrants/court orders, emergency disclosure, user notice, evidence exports, and audit. Owner/Admin Legal Intake and Legal Evidence are backed by `legal_request_intake`, `legal_request_events`, `legal_evidence_requests`, `legal_holds`, `admin-owner-controls`, and `admin-legal-evidence`; the May 22 release canary proved list/create/open/status/timeline/evidence linkage plus scoped preview/export/hold access. |
| Moderation / Enforcement / Appeals | Full production draft pending attorney review / linked in app | `app/moderation-policy.tsx`; covers report intake, review standards, enforcement options, appeals, repeat violations, evidence preservation, and admin workflow limits. |
| Creator Monetization / Revenue Disclaimer | Full production draft pending attorney review / linked in app | `app/creator-monetization.tsx`; confirms uploads do not automatically create payment or revenue-share rights. |
| DMCA agent public page/contact | Done / attorney review pending | Public copyright page now lists Chi'llywood's designated agent contact: Chi'llywood Copyright Agent / Chi'llywood, `support@chillywoodstream.com`, 9316 S Kimbark, Chicago, IL 60619, phone `3124879454`. |
| Copyright Office DMCA agent registration | Done | User-provided registration truth records Chi'llywood DMCA registration number `DMCA-1072720`; public Copyright Office directory status was checked as active effective May 13, 2026. |
| Copyright report flow | Implemented / hosted public URL live / live backed proof passed / scanner production proof passed / attorney review pending | `app/copyright-report.tsx` and hosted `https://chillywoodstream.com/copyright-report` collect formal notice fields and submit to `dmca_cases` through `submit_dmca_notice`; generic report sheet and Settings Legal & Support link copyright users to the formal route. Admin manual intake is backed by `admin_dmca_create_case`. Safe proof passed with invalid-notice rejection, public form case creation, private evidence attachment upload/access denial, Admin list/detail visibility, supported content hide/restore, filters/search, test-only proof-case hygiene, and access denial for normal users. New uploaded evidence queues `pending_scan` / `clamav`; production worker proof shows clean/EICAR outcomes and sanitized Admin scanner review. |
| Counter-notice workflow | Admin-recorded and uploader self-service workflows implemented and proved / attorney review pending | Admin can record counter-notices received through Support, forwarding, 10-14 business-day windows, court action notices, restore eligibility, and court-action restore blocking. Authenticated uploaders can submit counter-notices for their own cases through `app/counter-notice.tsx`; the backed RPC denies other users' cases and supports optional private evidence attachments. |
| Repeat infringer policy | Implemented and live-proof passed for Admin tracking / attorney review pending | `dmca_strikes` tracks active/removed/disputed/resolved/expired strikes and can open repeat-infringer review; proof confirmed valid takedown strike creation, rejected notice no-strike behavior, strike dispute/resolve, Admin visibility, and no automatic termination. |
| Account deletion in-app path | Linked in app / policy proof automated | Settings opens the full Account Deletion policy and support contact remains available. |
| Account deletion web link | Public static route generated / Play acceptance pending | `https://chillywoodstream.com/account-deletion` remains the preferred public Google Play URL; Play Console acceptance remains external. |
| Refund/subscription terms | Replaced by full Premium and Subscription Terms pending attorney review | Policy text lives in `legal/policies.mjs`; RevenueCat/Google Play proof remains external. |
| Creator payout rules | Drafted pending attorney review | Payouts remain not active/live. |
| Fraud/forfeiture rules | Drafted pending attorney review | Fraud foundations exist; live enforcement not connected. |
| Sponsor disclosure rules | Drafted pending attorney review | Sponsor money/checkout remains not active. |
| Banned content policy | Drafted pending attorney review | Policy created. |
| Moderation/reporting workflow | Drafted pending attorney review / repo-side report lifecycle and scanner pipeline backed | Generic reporting/admin moderation lifecycle is backed for intake, admin status changes, target hide/remove/restore, immutable audit, and Profile media report/admin actions. Dedicated production DMCA Admin case-management tooling exists; public hosted DMCA form, private evidence attachments, uploader-facing counter-notice self-service, and repo-side malware scan queueing/gates are backed. Production scanner deployment/runtime proof is closed. Outbound email automation, external ops SLA, attorney approval, and fraud/sponsor enforcement remain pending. |

## Required External Blockers Before Public Launch

- attorney/legal approval of Terms, Privacy, Creator Rules, Community Guidelines, Copyright/DMCA, Account Deletion, Refunds/Subscriptions, Payouts, Fraud/Forfeiture, Sponsor Disclosure, Banned Content, and Moderation workflow;
- final public URLs for Terms, Privacy, Account Deletion, Community Guidelines, Copyright/DMCA, Creator Rules, Copyright Report, and Support as needed;
- attorney review of the public DMCA designated agent/contact language and operational workflow;
- keep operational DMCA proof evidence internal only; backed/Admin live proof passed with safe disposable reporter/uploader/admin/viewer accounts and no private report artifacts committed;
- preserve and monitor the hosted public DMCA intake URL `https://chillywoodstream.com/copyright-report`; `PUBLIC_DMCA_URL` is configured for the canary/function path;
- keep U.S. Copyright Office DMCA agent registration current, including renewals/updates if agent contact information changes;
- support inbox receipt proof for `support@chillywoodstream.com` passed on May 13, 2026 by operator-confirmed destination-inbox receipt; no screenshots, raw headers, inbox exports, private contents, sender private details, credentials, tokens, or email secrets are committed;
- domain email baseline DNS is proved: Cloudflare MX records remain present, SPF is `v=spf1 include:_spf.mx.cloudflare.net ~all`, DMARC is `v=DMARC1; p=none; rua=mailto:support@chillywoodstream.com; adkim=r; aspf=r; fo=1`, root Brevo DKIM CNAME selectors for `chillywoodstream.com` are present/resolving, and current Brevo dashboard records under the `chillywood` host are applied/resolving.
- Supabase Auth custom SMTP is configured by Management API for project `bmkkhihfbmsnnmcqkoly`: host `smtp-relay.brevo.com`, sender name `Chi’llwood`, sender email `no-reply@chillywoodstream.com`; `POST /auth/v1/recover` for `rob2037gn@gmail.com` returns `200`.
- Remaining blocker is Brevo dashboard authentication refresh plus mailbox inbox delivery visibility and reset-link click behavior from safe test inbox (inbox proof and post-click login route still required).
- account deletion process/SLA/backend retention runbook;
- Google Play Android developer/package verification for `com.chillywood.mobile` is complete; Google Play account deletion URL acceptance and Data Safety answers remain pending;
- RevenueCat/Google Play purchase, restore, cancellation/refund/revocation proof if Premium ships live;
- live payout/sponsor/payment/fraud enforcement legal and provider approval before activating money movement.
