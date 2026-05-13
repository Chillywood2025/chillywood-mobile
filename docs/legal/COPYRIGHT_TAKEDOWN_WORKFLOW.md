# Copyright Takedown Workflow

Last updated: May 13, 2026

> Repo launch note: Attorney review required before public launch. This is an operational workflow, not a claim that DMCA safe harbor is complete.

## Current App Reality

The app has a generic report sheet with a `Copyright` category. It does not currently collect every formal DMCA notice field. A complete copyright-report form is an implementation blocker before Chi'llywood can treat in-app copyright reports as formal DMCA notices.

Existing intake:

- in-app generic report sheet: `components/safety/report-sheet.tsx`
- backed table/helper: `_lib/moderation.ts` and `safety_reports`
- public copyright page: `app/copyright.tsx`
- support route: `app/support.tsx`
- admin report readout: `app/admin.tsx`

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

Until a dedicated DMCA inbox is confirmed, support fallback is:

- support@chillywoodstream.com

Formal DMCA contact placeholder:

- [DMCA_EMAIL]

Do not publish `[DMCA_EMAIL]` as real contact until legal/support confirms the mailbox exists and is monitored.

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

## Repeat Offender Review

Review accounts with multiple valid copyright removals, severe willful infringement, stolen commercial media, ban evasion, or rights-holder abuse. Actions may include upload limits, channel restrictions, monetization hold, account suspension, or termination.

## Reporter And Uploader Privacy

Share only what is needed to process the claim, counter-notice, legal request, or safety review. Avoid exposing reporter identity unnecessarily to other users.

## Turnaround Target

[ATTORNEY / SUPPORT OWNER TO CONFIRM COPYRIGHT TURNAROUND TARGET]

## Implementation Blockers

- Dedicated DMCA form fields are not implemented.
- Dedicated DMCA inbox/contact is not confirmed.
- DMCA designated agent is not publicly posted.
- DMCA designated agent is not confirmed registered with the U.S. Copyright Office.
- Copyright claim log/admin workflow exists only as operational docs, not a complete dedicated backend workflow.
