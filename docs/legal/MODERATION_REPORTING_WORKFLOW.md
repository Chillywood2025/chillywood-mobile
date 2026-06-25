# Moderation And Reporting Workflow

Last updated: May 29, 2026

> Repo launch note: Attorney review required before public launch. This workflow documents current and required operations; it does not claim a complete trust-and-safety organization exists.

## Current Intake Sources

- in-app report sheet;
- support route and support email;
- copyright email/contact once confirmed;
- admin/operator review;
- automated detection later.

## May 29, 2026 Ops Closeout Update

Store/legal/account-deletion ops closeout mapped the remaining launch operations without claiming staffing or external acceptance. The detailed closeout lives at `docs/legal/STORE_LEGAL_ACCOUNT_DELETION_ACCEPTANCE_CLOSEOUT.md`.

Current operations truth:

- general safety report intake, Admin Reports review, report status changes, target hide/remove/restore, immutable audit rows, Profile Photo/Profile Background reports, Profile media status actions, and non-active Profile media masking are repo-backed;
- support/moderation/account deletion ownership is mapped by role, but launch staffing and SLA acceptance remain external;
- Support is a work area, not a separate staff role. Moderator role scope: Closed. Moderator can handle support duties when granted exact support scopes such as `support_inbox`, `creator_support`, `billing_support_read`, `admin.support.view`, `admin.support.manage`, `admin.dmca.view`, or `admin.dmca.manage`.
- outbound legal/support email remains manual until an outbound provider, DKIM, delivery proof, bounce handling, and templates are configured;
- repo-side malware scanning is implemented, production-deployed, runtime-proved, and Admin-reviewable;
- optional disposable report lifecycle visual proof was not run because no safe disposable fixture was provided and production reports must not be faked.

Supporting runbooks:

- `docs/legal/OUTBOUND_EMAIL_DKIM_RUNBOOK.md`
- `docs/security/MALWARE_SCANNING_READINESS_PLAN.md`

## Report Categories

Public policy categories:

- copyright;
- harassment;
- hate;
- violence/threats;
- sexual/minor safety;
- illegal goods;
- spam/scam;
- impersonation;
- privacy/doxxing;
- fraud;
- other.

Current backed in-app categories:

- abuse;
- harassment;
- impersonation;
- copyright;
- safety;
- other.

Implementation gap: the current report UI maps fraud, scams, unsafe products, illegal goods, spam, and malware into `safety`, and sponsorship disclosure into `other`. Dedicated categories require a schema/UI pass.

## Triage Priority

1. urgent child safety, credible threats, immediate danger, illegal live behavior, or severe exploitation;
2. live-room danger, doxxing, account compromise, malware, or active scam;
3. copyright notices and clear stolen commercial media;
4. fraud, payment, sponsor, payout, fake engagement, or chargeback issues;
5. general harassment, spam, impersonation, privacy, and content/user conduct;
6. low-context or incomplete reports.

## Review Actions

Moderators and Admins may take one or more actions where backed and scoped. Moderator destructive actions require permission, reason, confirmation, case/report context where applicable, and audit. Moderator cannot grant/revoke Owner or Admin/operator, cannot alter First Owner succession, cannot remove/demote/delete/deactivate/suspend First Owner, cannot enable money/provider/payout systems, and cannot execute provider refunds.

- no action;
- ask for more information;
- label, limit, or reduce distribution;
- remove, hide, disable, or unpublish content;
- disable a live room;
- restrict upload, live, chat, comment, sponsor, or monetization access;
- suspend account;
- terminate account;
- hold payouts or monetization where backed and legally allowed;
- preserve evidence;
- escalate to legal, copyright, payment provider, app store, law enforcement, or safety authority where required.

## Audit Requirements

Record:

- reviewer/moderator;
- action;
- reason;
- timestamp;
- target type and id;
- reporter id where available;
- affected user/account/content;
- policy category;
- evidence/context;
- appeal/review status.

Avoid exposing reporter identity unnecessarily.

## Appeals And Review

Users may appeal certain actions through support where supported. Repeat abuse, bad-faith reports, harassment through appeals, or severe violations may limit appeal options.

## Admin Tooling Status

Current admin tooling:

- recent safety reports can be read by platform roles;
- report queue overview/list/detail reads are backed by `safety_reports` RPCs;
- report status actions are backed: Mark Reviewed, Dismiss, and Escalate require a reason, update status/resolution timestamps, and write immutable audit rows;
- target moderation actions are backed: Hide From Public, Remove From Public, and Restore Clean require a selected report plus reason and write immutable target-action audit rows;
- creator videos, profile posts, profile post comments, creator-video comments, social attachments, and Profile media can be actioned where their public read paths honor moderation/status fields;
- Profile Photo and Profile Background can be reported from the Profile Actions sheet when the media exists; admin target actions set Profile media to `flagged`, `admin_removed`, or `active`, and public Profile reads mask non-active media;
- DMCA cases are backed by dedicated tables for formal notices, counter-notices, content actions, strikes, and audit history;
- Owner can always access Admin DMCA; approved Admin access requires `dmca_review`, `copyright_review`, or `legal_review`; Moderator access requires exact DMCA/legal scopes and remains separate from Admin; regular users are denied server-side;
- Owner, scoped Admin, or scoped Moderator can list/detail DMCA cases, mark case statuses, record hide/disable/restore/rejected-no-action/preserved-evidence actions, add/remove/dispute/resolve strikes, record counter-notices, record forwarding/court-action notices, mark restore eligibility, and view functional case history only where backed and permissioned;
- normal users cannot access Admin DMCA case details or private reporter/uploader contact fields through the DMCA tables;
- live backed/Admin DMCA proof passed with disposable reporter/uploader/admin/viewer accounts and safe profile-post/comment/creator-video content, including invalid notice rejection, notice creation, Admin list/detail/status, content hide/restore, public hidden/restored visibility, strike/repeat-infringer review, rejected no-strike behavior, counter-notice deadlines, court-action restore blocking, RLS/private-data denial, generic report compatibility, and proof-content cleanup;
- production Admin DMCA/public-legal closeout proof on physical Android `R5CR120QCBF` returned `60 pass`, `0 manual_required`, and `0 failed`, including hosted public DMCA URL reachability, public form submission, private evidence attachment upload/access denial, uploader self-service counter-notice/other-user denial, Admin readback/cleanup, email-intake mode, and content mutation coverage;
- proof/demo/canary DMCA cases are marked test-only and hidden from production clients;
- fraud runtime enforcement hooks are not connected;
- payout holds are foundation-only unless a future release proves enforcement.

DMCA content disable/restore support currently covers `creator_video`, `profile_post`, `profile_post_comment`, `comment`, `creator_video_comment`, `reply`, `social_attachment`, and `attachment`. `live_room`, `channel`, and `other` remain preserve-only/disabled with exact missing-backend reasons and require support/legal handling; no LiveKit action is part of DMCA mutation coverage.

Outbound email automation is pending. Admin/support notification templates exist for receipt confirmation, incomplete notice, rejection, uploader notice, counter-notice receipt/forwarding, restore eligibility, content restore, and repeat-infringer warnings, but sending remains manual unless a future email lane proves automation. DMCA evidence attachment storage/retention is backed through private `dmca-evidence` storage and Admin-only metadata readback; new evidence rows queue `pending_scan` / `clamav`, and production scanner coverage is proved by the May 30 ClamAV worker proof.

## Launch Gaps

- attorney/legal approval of the workflow and policy language;
- Google Play/Data Safety/account deletion acceptance where the workflow is referenced in store claims;
- support/moderation owner, response SLA, escalation playbook, and account deletion operations owner;
- outbound email automation proof and DKIM after a real outbound provider is configured;
- production malware scanner monitoring/SLO polish only; deployment/runtime proof is closed;
- optional disposable-fixture runtime drill for a full general report lifecycle if the launch owner wants fresh visual proof beyond source/guard/Admin screenshot proof;
- reviewer assignment queue;
- automated evidence bundle;
- user-facing appeal center;
- live-room/channel DMCA action tooling;
- dedicated fraud/sponsor/payout enforcement workflow;
- final severe-safety escalation owner and SLA.
