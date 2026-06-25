# Store Legal Account Deletion Acceptance Closeout

Date: 2026-05-29
Lane: Store Legal Account Deletion Ops Closeout
Starting HEAD: `73e02a0` (`Close out moderation legal blocker docs`)
Proof folder: `/tmp/chillywood-store-legal-account-deletion-ops-closeout-20260529/`

This closeout records what is repo-backed, what was runtime or URL checked, and what remains external for Google Play, legal approval, support operations, account deletion operations, and outbound email. It does not claim Play Console acceptance, Data Safety approval, attorney approval, DKIM verification, support staffing, or account deletion fulfillment. Production scanner deployment proof was closed later on May 30, 2026.

June 25, 2026 legal/privacy/Data Safety final alignment: `docs/legal/LEGAL_PRIVACY_DATA_SAFETY_FINAL_ALIGNMENT.md` supersedes older wording where needed. Account deletion uses scheduled deletion, restore window where supported, and controlled purge/de-identification. Legal/security/payment/support/moderation evidence retention exceptions are preserved. Public legal pages avoid proof/debug/internal wording. Provider refunds remain manual/external, Premium annual remains provider-blocked, creator-money remains OFF, and no payouts, Stripe Connect, merch checkout, payable balances, or money movement are live.

## Official References To Recheck

Google Play requirements can change. Recheck these official references during the final external submission:

- Google Play User Generated Content policy: `https://support.google.com/googleplay/android-developer/answer/9876937`
- Google Play Data Safety: `https://support.google.com/googleplay/android-developer/answer/10787469`
- Google Play account deletion requirements: `https://support.google.com/googleplay/android-developer/answer/13327111`

## May 30, 2026 Google Play Execution Package Update

The repo-side owner/operator execution package is now created:

- `docs/google-play/PLAY_CONSOLE_EXECUTION_CHECKLIST.md`
- `docs/google-play/DATA_SAFETY_EVIDENCE_MAP.md`
- `docs/google-play/ACCOUNT_DELETION_URL_CONTENT.md`
- `docs/google-play/REVIEWER_ACCESS_INSTRUCTIONS.md`
- `docs/google-play/STORE_LISTING_ASSET_CHECKLIST.md`

Proof folder: `/tmp/chillywood-google-play-acceptance-closeout-20260530/`.

Public URL proof returned HTTP 200 after redirects for Privacy, Terms, Account Deletion, Copyright, Copyright Report, Support, Moderation Policy, Community Guidelines, and Creator Rules. Android proof on `R5CR120QCBF` captured Settings Legal and Support, Privacy, Terms, Account Deletion, Copyright Report, and Moderation Policy. The direct Support deep link did not resolve in that proof, so prior May 29 release Support proof remains current until recaptured.

Production malware scanning is now closed: `chillywood-prod-01` runs the ClamAV worker, benign/EICAR proof passed, public rendering fails closed for unsafe scan states, and Admin scan-result review is sanitized. DKIM remains unverified; Play Console/Data Safety/content-rating/account-deletion acceptance, legal approval, account deletion fulfillment, and support staffing remain external.

## Evidence

| Evidence | Path / command | Result |
| --- | --- | --- |
| Starting command log | `/tmp/chillywood-store-legal-account-deletion-ops-closeout-20260529/starting-commands.log` | `git status`, `git log`, `npm run typecheck`, `npm run validate:runtime`, and `supabase migration list` passed. |
| Public legal URL check | `/tmp/chillywood-store-legal-account-deletion-ops-closeout-20260529/public-legal-url-check.tsv` | Privacy, Terms, Account Deletion, Copyright, Copyright Report, Support, Community Guidelines, Creator Rules, Moderation Policy, and Premium Terms returned HTTP 200 after redirects. |
| DNS/email check | `/tmp/chillywood-store-legal-account-deletion-ops-closeout-20260529/dns-email-check.txt` | Cloudflare MX, SPF, and DMARC baseline records are present. Common DKIM selectors returned no public DKIM record, so DKIM remains unverified. |
| Current release Android legal proof | `/tmp/chillywood-public-v1-eight-blocker-burndown-20260529/` | Existing current-release screenshots cover Settings, Support, Account Deletion, Admin Reports, Copyright Report, Moderation Policy, Privacy, and Terms. |
| Repo-side moderation source proof | `/tmp/chillywood-blocker8-moderation-legal-closeout-20260529/source-proof.log` | General reports, admin status/action paths, immutable audit rows, Profile media reports/actions, and non-active Profile media masking are backed by code/schema. |

## Play / Data Safety / Account Deletion Acceptance Map

| Item | Repo evidence | Runtime / URL evidence | External owner step | Status | Launch impact | Proof / doc |
| --- | --- | --- | --- | --- | --- | --- |
| App package name | `app.json`, `android/app/build.gradle`, and Android namespace use `com.chillywood.mobile`. | Current release APK installed during eight-blocker proof. | Confirm the package in Play Console before upload/submission. | Partial | P0 for store release | `docs/ANDROID_RELEASE_EAS_RUNBOOK.md`; eight-blocker proof folder |
| App icon / splash | App icon, adaptive icon, and splash assets are configured in `app.json` and Android resources. | Current release opened past splash on `R5CR120QCBF`. | Confirm final store listing icon/feature graphic/splash screenshots in Play Console. | Partial | P1 | Eight-blocker screenshots `00` through `02` |
| AAB/APK proof | `assembleRelease` and `bundleRelease` passed during the eight-blocker lane. | APK installed and opened on `R5CR120QCBF`. | Upload the final AAB to the intended Play track and run Play pre-launch review. | Partial | P0/P1 | `/tmp/chillywood-public-v1-eight-blocker-burndown-20260529/release-artifacts.txt` |
| Privacy Policy | `legal/policies.mjs`, `app/privacy.tsx`, public legal site. | `https://chillywoodstream.com/privacy` returned HTTP 200 after redirect; Android route screenshot exists. | Attorney approval; enter final URL in Play Console. | Partial | P0 | `public-legal-url-check.tsv`; screenshot `49-privacy-route.png` |
| Terms | `legal/policies.mjs`, `app/terms.tsx`, public legal site. | `https://chillywoodstream.com/terms` returned HTTP 200 after redirect; Android route screenshot exists. | Attorney approval; include in listing/support materials as required. | Partial | P0/P1 | `public-legal-url-check.tsv`; screenshot `50-terms-route.png` |
| Support contact | `EXPO_PUBLIC_SUPPORT_EMAIL` fallback is `support@chillywoodstream.com`; `app/support.tsx`; Support screen. | `https://chillywoodstream.com/support` returned HTTP 200; Support route screenshot exists; DNS MX/SPF/DMARC baseline present. | Assign support owner, response SLA, inbox monitoring, and outbound receipt process. | Partial | P1 | `dns-email-check.txt`; screenshot `18-support-legal-route.png` |
| DMCA / copyright | `app/copyright.tsx`, `app/copyright-report.tsx`, `_lib/dmca.ts`, Admin Legal/DMCA tooling. | Copyright Report URL returned HTTP 200; screenshot exists. | Attorney review; maintain designated agent registration/contact; define outbound notice process. | Partial | P0/P1 | `docs/legal/LEGAL_LAUNCH_CHECKLIST.md`; screenshot `44-copyright-report-route.png` |
| Account deletion instructions | `app/account-deletion.tsx`, public legal site, Settings/support handoff. | `https://chillywoodstream.com/account-deletion` returned HTTP 200; Android route screenshot exists. | Enter URL in Play Console, confirm it satisfies account-deletion policy, and define manual deletion/de-identification process. | Partial | P0 | `public-legal-url-check.tsv`; screenshot `19-account-deletion-route.png` |
| In-app account deletion path | Settings > Account actions exposes Delete Account and Restore Account when scheduled. | June 3 device/backend proof shows scheduled deletion, public-search hiding, restore, and active-state return. | Prove permanent purge/de-identification job/runbook and assign SLA owner after restore deadline. | Partial | P0/P1 | `app/settings.tsx`; `_lib/accountDeletionRequests.ts`; `20260603014500_self_service_account_deletion_30_day_restore.sql` |
| Data collection / Data Safety answers | `docs/google-play/DATA_SAFETY_EVIDENCE_MAP.md` maps data types, third-party SDKs, and provider disclosures to repo evidence. | No Play Console acceptance claimed. | Release owner completes Play Data Safety form using current SDK/provider truth and saves external proof. | Blocked external | P0 | `docs/google-play/DATA_SAFETY_EVIDENCE_MAP.md` |
| Content rating readiness | UGC, live, chat, copyright, moderation, and support policy text exists. | No Play Console content-rating receipt claimed. | Complete Play content rating questionnaire with final policy/legal owner. | Blocked external | P0/P1 | `legal/policies.mjs`; `docs/legal/LEGAL_LAUNCH_CHECKLIST.md` |
| App access / test account readiness | Current Android proof used an owner session; public/signed-out routes are available. | Full Play review test-account proof is not captured in this lane. | Use `docs/google-play/REVIEWER_ACCESS_INSTRUCTIONS.md`; enter test credentials only in Play Console. | Partial | P1 | `docs/google-play/REVIEWER_ACCESS_INSTRUCTIONS.md` |
| Store listing assets / screenshots | Current release screenshots exist outside the repo. | Legal/settings/admin screenshots are available in the eight-blocker proof folder and May 30 legal proof folder. | Select final store screenshots, feature graphic, short/full descriptions, and privacy disclosures in Play Console. | Partial | P1 | `docs/google-play/STORE_LISTING_ASSET_CHECKLIST.md` |
| Paid digital goods policy | Premium remains gated; live money is off; Money Center docs separate Google/RevenueCat and Stripe roles. | Money Center screenshot exists; provider proof remains sandbox/setup-only. | Do not promote paid digital goods until RevenueCat/Google proof and Play billing compliance are complete. | Partial | P1 for monetized launch | `docs/MONEY_CENTER_PRODUCT_POLICY.md` |
| Ads status | Ads defaults remain disabled; no fake ad revenue or live ad delivery. | No live ad proof claimed. | Declare no active ads unless a later ad provider lane proves real delivery and disclosures. | Partial | P1/P2 | `ROADMAP.md`; guard stack |
| User-generated content / moderation | Report intake, Admin reports, target actions, audit rows, DMCA tooling, Profile media report actions are backed. | Admin Reports, Copyright Report, and Moderation Policy screenshots exist. | Assign moderation/support owner, SLA, escalation, and optional disposable-fixture lifecycle proof. | Partial | P1 | `docs/legal/MODERATION_REPORTING_WORKFLOW.md` |
| Report / block support | Report sheet, Profile media report, Admin Reports, and block/profile actions exist where backed. | Report lifecycle visual drill was not run without a safe disposable fixture. | Provide disposable normal/admin accounts and harmless target if a visual lifecycle drill is required. | Partial | P1 | `_lib/moderation.ts`; `components/safety/report-sheet.tsx` |
| Legal approval | Policy text is drafted and public URLs are live. | No attorney approval claimed. | Attorney/legal owner signs off on policy text, Data Safety claims, deletion process, moderation process, DMCA process, Premium terms, and support copy. | Blocked external | P0 | `docs/legal/LEGAL_LAUNCH_CHECKLIST.md` |

## Account Deletion Runtime And Ops Readiness

Current behavior:

- Users can start at Settings or the public web route.
- `app/account-deletion.tsx` is public and describes the Delete Account path, 30-day restore window, retention exceptions, and support fallback.
- Settings prefers configured external URLs and otherwise falls back to bundled app routes.
- `components/system/support-screen.tsx` supports `topic=account-deletion`; signed-out users are routed to sign in before sending account-specific support feedback.
- No destructive account deletion is performed by this route.
- No repo code claims deletion is automatically fulfilled.

Required operating process before public launch:

| Step | Current state | Owner | SLA target | Evidence / audit | Gap |
| --- | --- | --- | --- | --- | --- |
| User starts deletion | Settings / Account Deletion / Support path exists. | Support operator | Immediate route availability | Android screenshots and URL proof | None repo-side. |
| Request intake | Signed-in support feedback path exists; external support email exists. | Support operator | Acknowledge within 2 business days after launch owner assigns staffing | `beta_feedback_items` for in-app feedback if used; support inbox if email is used | Final queue/tool owner not assigned in repo. |
| Identity verification | Manual support process required. | Support operator / Owner/Admin | Before destructive or irreversible action | Support ticket/audit note | Verification checklist must be approved externally. |
| Data deletion / de-identification | Policy text documents categories and retention exceptions. | Owner/Admin with backend operator | Complete within the published legal/store SLA | Admin/support audit note; backend deletion runbook | Automated deletion workflow is not built. |
| Retained records | Legal/safety/billing/moderation retention exceptions documented. | Legal/DMCA operator / Owner/Admin | As required by policy/law | Retention notes in case/ticket | Attorney approval required. |
| Completion notice | Outbound email automation is not configured. | Support operator | After manual completion | Support email/ticket record | DKIM/outbound email pending; manual email is current fallback. |
| Escalation | Severe legal/safety/copyright cases require owner/legal review. | Owner/Admin, Legal/DMCA operator, external counsel if retained | Same day for urgent safety; 2 business days for legal triage | Admin audit/ticket | External counsel/staffing not confirmed. |

Launch classification: account deletion is **P0 external/ops** for public store release until Play Console account deletion URL acceptance, final SLA ownership, legal approval, and the permanent backend deletion/de-identification process are confirmed. It is acceptable for controlled Android testing if testers are told Delete Account schedules deletion with a 30-day restore window and no fake permanent purge completion is claimed.

## Operational Ownership And SLA Map

These are role requirements, not staffing claims.

| Queue / operation | Responsible role | Inbox / tool | Response target | Action target | Evidence / audit table | Escalation | Off-hours rule | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| General support requests | Support operator | `support@chillywoodstream.com`; in-app support feedback where signed in | 2 business days | 5 business days or next update | Support inbox; `beta_feedback_items` if in-app path used | Owner/Admin | Urgent safety escalates same day | Manual / external owner pending |
| Safety reports | Moderation operator | Admin Reports | 1 business day; urgent same day | Hide/remove/restore where backed after review | `safety_reports`; `platform_admin_audit_logs` | Owner/Admin; external legal/safety as needed | Urgent child safety/threats escalate same day | Repo-backed tooling / ops owner pending |
| Copyright / DMCA notices | Legal/DMCA operator | Public Copyright Report; support inbox; Admin Legal/DMCA | Acknowledge according to approved legal process | Takedown/counter-notice/restore according to legal process | `dmca_cases`; DMCA audit/action tables | External counsel / Owner/Admin | Urgent infringement escalates next business day unless legal requires faster | Repo-backed tooling / attorney review pending |
| Profile media reports | Moderation operator | Profile Actions report path; Admin Reports | 1 business day | Flag/admin remove/restore where backed | `safety_reports`; Profile media status columns; admin audit logs | Owner/Admin | Severe/illegal media same day | Repo-backed tooling / ops owner pending |
| Moderation review | Moderation operator | Admin Reports and Admin DMCA/Legal | 1 business day | 5 business days unless urgent | `platform_admin_audit_logs`; report/DMCA tables | Owner/Admin; external counsel | Urgent safety same day | Repo-backed tooling / staffing pending |
| Account deletion | Support operator / Owner/Admin | Settings/Support/Account Deletion route; support inbox | Acknowledge within 2 business days | Fulfill within final legal/store SLA | Support ticket; backend/admin audit note | Owner/Admin; external counsel | Identity/security concerns escalate before action | Manual external blocker |
| Appeals / restores | Moderation operator / Legal operator | Support route/inbox; Admin Reports/DMCA | 5 business days after valid request | Restore or uphold after review | Report audit rows; DMCA case/action tables | Owner/Admin / external counsel | Urgent wrongful-removal escalates next business day | Manual / partially repo-backed |
| Urgent safety escalation | Owner/Admin | Support inbox plus Admin Reports | Same day | Immediate restriction/reporting where legally required | Admin audit; support/legal case notes | External counsel/law enforcement/safety authority where required | Off-hours same-day owner escalation required | External owner pending |

## Outbound Email And DKIM Status

Detailed runbook: `docs/legal/OUTBOUND_EMAIL_DKIM_RUNBOOK.md`.

Current status:

- Support address: `support@chillywoodstream.com`.
- DNS proof shows Cloudflare MX records are present.
- SPF baseline exists: `v=spf1 include:_spf.mx.cloudflare.net ~all`.
- DMARC baseline exists: `v=DMARC1; p=none; rua=mailto:support@chillywoodstream.com; adkim=r; aspf=r; fo=1`.
- Common DKIM selectors checked from public DNS returned no DKIM records.
- No outbound provider/DKIM verification is claimed.
- No real user email was sent in this lane.

Launch classification: outbound email/DKIM is **P1 external ops** for broad launch and legal operations. It is not a repo-code blocker while manual support email is the documented fallback, but account deletion/DMCA/moderation receipts should not be represented as automated until a provider is configured and proved.

## Malware Scanning Status

Detailed plan: `docs/security/MALWARE_SCANNING_READINESS_PLAN.md`.

Current status:

- Repo-side scanner pipeline is implemented through migrations `20260530191115_media_malware_scanning_pipeline.sql` and `20260530193203_fix_dmca_scan_enqueue_loop.sql`.
- ClamAV worker source lives at `ops/malware-scanner-worker/`.
- New supported media surfaces queue `pending_scan` / `clamav` metadata.
- Public rendering/storage gates require `clean` or explicit `manual_review` legacy status.
- Production worker deployment/runtime proof is still pending and must not be claimed until captured.

Launch classification after the May 30 scanner production closeout: **closed as a repo-side launch blocker**. The app can claim configured upload scan paths are scanned by the production ClamAV worker, with the limitation that future hardening can still add alert SLO polish and signed-delivery revocation for already-leaked public bucket URLs.

## Disposable Report Lifecycle Proof

Result: not run in this lane.

Reason:

- No safe disposable normal-user/admin fixture and harmless target were provided specifically for this lane.
- Creating a fake production report or harmful moderation incident would violate launch proof rules.
- Existing repo/source/backend proof and current Admin Reports screenshot remain the honest evidence boundary.

Exact fixture required to run later:

- a disposable normal viewer account;
- an owner/admin account with a restorable session;
- a harmless disposable public profile post or Profile media object;
- permission to submit one clearly labeled safe test report;
- permission to admin-review, hide/remove/restore the disposable target;
- cleanup steps and screenshots kept outside the repo.

## Updated Blocker Status

| Blocker | Status after this lane | Class | Blocks controlled Android test | Blocks broad public launch | Next action |
| --- | --- | --- | --- | --- | --- |
| Play / Data Safety / account deletion acceptance | External blocked | P0 | Yes for public Play distribution; no for private controlled testing | Yes | Complete Play Console forms, account deletion URL entry, content rating, store listing, test account instructions, and save external proof. |
| Support / moderation / account deletion SLA owner | Mapped, external owner pending | P1 | No if owner manually monitors test feedback | Yes | Assign named owner/operator coverage, response/action targets, escalation, and audit process. |
| Outbound email / DKIM | DNS baseline proved, outbound/DKIM pending | P1 | No | Yes for polished support/legal ops | Choose outbound provider, verify domain, publish DKIM, send test receipt, save proof outside repo. |
| Malware scanner deployment proof | Closed | Not a current blocker | No | No | Production worker is deployed, benign/EICAR proof passed, public gates fail closed, and Admin scan-result review is sanitized. Future work is monitoring/SLO polish and signed-delivery hardening only. |
| Optional disposable report lifecycle visual proof | Blocked on safe fixture | P2/P1 optional | No | No if source/backend proof is accepted; yes only if launch owner requires visual receipt | Provide disposable accounts/target and run the harmless report/hide/restore cleanup drill. |

Counts after the May 30 malware-scanning pipeline implementation:

- P0 blockers: 1
- P1 blockers: 10
- P2 deferrals: 10

The remaining P0 is external store/legal/account-deletion acceptance, not a newly discovered app-code defect.

## Recommended Next Lane

External/manual lane: **Play Console Data Safety And Account Deletion Submission** using `docs/google-play/`.

Engineering lane after external setup or in parallel: **Release Diagnostics And Signed-Out/Signed-In Route Smoke Closeout**.

Do not build new product features while these remain open.
