# Moderation And Reporting Workflow

Last updated: May 14, 2026

> Repo launch note: Attorney review required before public launch. This workflow documents current and required operations; it does not claim a complete trust-and-safety organization exists.

## Current Intake Sources

- in-app report sheet;
- support route and support email;
- copyright email/contact once confirmed;
- admin/operator review;
- automated detection later.

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

Moderators/operators may take one or more actions where backed:

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
- creator-video moderation status can be set to hidden, removed, or clean by owner/operator roles;
- DMCA cases are backed by dedicated tables for formal notices, counter-notices, content actions, strikes, and audit history;
- owner/operator Admin can list/detail DMCA cases, mark case statuses, record hide/disable/restore/no-action/evidence actions, add/remove strikes, record counter-notices, record forwarding/court-action notices, mark restore eligibility, and view audit history;
- normal users cannot access Admin DMCA case details or private reporter/uploader contact fields through the DMCA tables;
- live backed/Admin DMCA proof passed with disposable reporter/uploader/admin/viewer accounts and safe profile-post/comment/creator-video content, including invalid notice rejection, notice creation, Admin list/detail/status, content hide/restore, public hidden/restored visibility, strike/repeat-infringer review, rejected no-strike behavior, counter-notice deadlines, court-action restore blocking, RLS/private-data denial, generic report compatibility, and proof-content cleanup;
- first-class open/resolved report workflow is not connected;
- fraud runtime enforcement hooks are not connected;
- payout holds are foundation-only unless a future release proves enforcement.

DMCA content disable/restore support currently covers creator videos, profile posts, profile-post comments, creator-video comments, and social attachments. Live-room and channel-level takedowns still need a separate safe moderation action or support/legal handling.

Outbound email automation is pending. Admin/support notification templates exist for receipt confirmation, incomplete notice, rejection, uploader notice, counter-notice receipt/forwarding, restore eligibility, content restore, and repeat-infringer warnings, but sending remains manual unless a future email lane proves automation.

## Launch Gaps

- report status lifecycle: open, investigating, actioned, dismissed, appealed, closed;
- reviewer assignment queue;
- automated evidence bundle;
- user-facing appeal center;
- uploader-facing counter-notice submission route;
- live-room/channel DMCA action tooling;
- outbound email automation proof;
- dedicated fraud/sponsor/payout enforcement workflow;
- final severe-safety escalation owner and SLA.
