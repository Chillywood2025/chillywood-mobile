# Copyright Takedown Workflow

Last updated: May 22, 2026

> Repo launch note: Attorney review required before public launch. DMCA designated agent registration is now recorded as complete from the provided registration details, but this workflow does not claim full legal compliance or replace attorney review.

## Current App Reality

The app has a generic report sheet with a `Copyright` category, and that category points users to the formal copyright notice route. A dedicated in-app copyright report route exists at `app/copyright-report.tsx` and submits required notice fields through the backed `submit_dmca_notice` RPC.

Admin DMCA is now a production case-management surface, not a proof/debug panel. Owner can always access it. Approved Admin/operator users can access it only with scoped `dmca_review`, `copyright_review`, or `legal_review` permission. Moderators and regular users are denied by server-side RLS/RPC checks; there is no client-only security claim.

Existing intake:

- in-app generic report sheet: `components/safety/report-sheet.tsx`
- formal copyright report route: `app/copyright-report.tsx`
- backed table/helper: `_lib/moderation.ts` and `safety_reports`
- DMCA case helper: `_lib/dmca.ts`
- public copyright page: `app/copyright.tsx`
- support route: `app/support.tsx`
- admin report and DMCA case-management panel: `app/admin.tsx`
- backed DMCA schema/RPC migration: `supabase/migrations/202605140001_dmca_operational_tooling.sql`
- production Admin DMCA closeout migration: `supabase/migrations/202605210002_dmca_admin_production_closeout.sql`
- production test/proof-case hygiene migration: `supabase/migrations/202605210003_dmca_test_case_hygiene.sql`
- Admin DMCA canary checks: `supabase/functions/admin-owner-controls/index.ts`

## Required Copyright Report Form Fields

A formal copyright complaint form should collect:

- reporter role: copyright owner or authorized agent;
- copyright owner name;
- authorized agent name, if different;
- email;
- mailing address;
- phone, if used;
- copyrighted work identification;
- allegedly infringing Chi'llywood URL/route/content id;
- creator/channel/profile/message/room id where known;
- statement of good-faith belief;
- statement under penalty of perjury that information is accurate and sender is authorized;
- electronic signature;
- permission to share notice details with uploader where appropriate.

## Support Inbox Target

Formal DMCA notices should be sent to Chi'llywood's designated agent contact:

- Service provider: Chi'llywood
- DMCA registration number: DMCA-1072720
- DMCA agent name: Chi'llywood Copyright Agent / Chi'llywood
- DMCA email: support@chillywoodstream.com
- Mailing address: 9316 S Kimbark, Chicago, IL 60619
- Phone: 3124879454

Support inbox receipt proof for `support@chillywoodstream.com` remains tracked separately in launch readiness docs.

## Triage Steps

1. Record the notice in a copyright claim log.
2. Check whether required fields are complete.
3. Identify the content, uploader, route, storage object, room, message, post, comment, or file.
4. Preserve relevant metadata and evidence where needed.
5. If the claim appears urgent or clear, disable public access while review continues.
6. Notify the uploader where appropriate.
7. Decide whether the notice is valid, incomplete, abusive, duplicate, or outside copyright scope.
8. Apply a strike if the claim is valid and not resolved by retraction, counter-notice, or reinstatement.
9. Record moderator/legal reviewer, action, reason, timestamp, claim id, affected content id, and uploader id.

Implemented backed flow:

1. `submit_dmca_notice(jsonb)` stores a formal notice as a `dmca_cases` row and returns only case id, case number, and status to the submitter.
2. `admin_dmca_create_case(jsonb,text)` lets Owner or a scoped Admin/operator manually record formal notices from admin/manual/public/support/email sources.
3. Owner or a scoped Admin/operator can read the private case list/detail; normal users cannot read the full case table.
4. Admin DMCA supports Received, Needs More Info, Under Review, Content Disabled, Counter Notice Received, Waiting Rightsholder Response, Eligible For Restore, Repeat Infringer Review, Closed, Rejected No Action, and Preserved Evidence.
5. Owner or a scoped Admin/operator can record hide/disable/restore/rejected-no-action/preserved-evidence actions through `admin_dmca_record_content_action`. The RPC never silently deletes content.
6. Owner or a scoped Admin/operator can add, remove, dispute, and resolve copyright strikes. Valid takedown/evidence-preservation case states can add active strikes; rejected or incomplete notices should not.
7. Owner or a scoped Admin/operator can record counter-notices, forwarding, court action notices, restore eligibility, and case history.
8. Production proof passed from physical Android device `R5CR120QCBF`: DMCA tab open, real case list load, real case detail open, formal notice intake form open, content action recording, strike add/dispute/resolve, counter-notice record/forward/eligible flow, filters/search, proof-case test-only hygiene, and server-side denial for unauthorized users. The DMCA canary returned `44 pass`, `1 manual_required`, and `0 failed`.

## Emergency Disable / Removal

Disable access quickly when a report identifies clear infringement, stolen commercial media, repeat infringement, high-risk live stream, or content that creates legal/safety urgency.

Do not delete evidence needed for review unless the legal owner approves deletion.

## Incomplete Reports

Ask for missing fields. Do not treat incomplete reports as formal DMCA notices unless legal counsel approves the process.

## Duplicate Reports

Link duplicate reports to the original claim record. Do not double-count strikes for the same rightsholder, work, content item, and claim event unless legal review confirms a separate violation.

## Abusive Reports

Escalate reports that appear false, retaliatory, automated, harassing, or designed to suppress lawful content. Abusive reports may lead to account action.

## Counter-Notice Workflow

1. Confirm the uploader's identity and affected content.
2. Collect required counter-notice fields.
3. Check the statement under penalty of perjury and jurisdiction/service placeholder.
4. Notify the claimant where appropriate.
5. Track the legal response window.
6. Reinstate content only if allowed by law, legal review, and platform policy.
7. Remove or reduce strikes if the takedown is reversed.

[ATTORNEY TO CONFIRM COUNTER-NOTICE TIMING AND JURISDICTION LANGUAGE]

Current implementation supports Admin-recorded counter-notices received by Support/email. It stores submitter details, required statements, signature, forwarding time, 10-business-day restore-not-before date, 14-business-day restore-not-after date, court-action notice time, and status. Court-action notices block both restore-eligible status and the restore content action. A direct uploader-facing counter-notice route is still pending; the Admin UI states that uploader-facing submission is not implemented yet and admin recording is supported.

## Repeat Offender Review

Review accounts with multiple valid copyright removals, severe willful infringement, stolen commercial media, ban evasion, or rights-holder abuse. Actions may include upload limits, channel restrictions, monetization hold, account suspension, or termination.

Current implementation supports active/removed/disputed/resolved/expired strikes by user/channel/case/content and opens repeat-infringer review when Admin records a severe strike or the active strike count reaches the configured review threshold in the RPC. It does not automatically terminate accounts.

## Reporter And Uploader Privacy

Share only what is needed to process the claim, counter-notice, legal request, or safety review. Avoid exposing reporter identity unnecessarily to other users.

## Turnaround Target

[ATTORNEY / SUPPORT OWNER TO CONFIRM COPYRIGHT TURNAROUND TARGET]

## Remaining Manual / External Items

- Live end-to-end backed/Admin DMCA proof with safe disposable reporter/uploader/admin/viewer accounts and supported content targets passed on May 14, 2026.
- Production Admin DMCA case-management closeout proof passed on May 21/22, 2026 through the physical Android owner device and `admin-owner-controls` version 12.
- Support inbox receipt proof for `support@chillywoodstream.com` is closed in launch readiness docs.
- DMCA designated agent public contact and U.S. Copyright Office registration are recorded as complete from the provided registration details.
- Uploader-facing counter-notice submission route is still pending; Admin-recorded counter-notices are implemented and proved.
- Outbound email automation is still pending; notification templates/status recording are implemented for manual support/admin workflow and template coverage is proved. The Admin UI states: `Manual email intake enabled. Automated email ingestion not configured.`
- Hosted public DMCA URL env configuration is still manual-required; the in-app `/copyright-report` route exists.
- Live-room and channel-level DMCA disable/restore require a separate safe moderation action; this tool supports creator videos, profile posts, profile-post comments, creator-video comments, and social attachments.
- Proof/demo/canary cases are marked `is_test_case` and hidden from production clients.
