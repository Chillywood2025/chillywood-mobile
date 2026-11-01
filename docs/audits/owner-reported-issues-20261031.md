# Owner-reported issue inventory — October 31, 2026

Status labels are deliberately separate: **reported**, **reproduced**, **source
fixed**, **verified**, and **deployed**. A source commit or passing automated
check does not mean the installed application changed.

## Verified and saved, not deployed

- **Earlier app repair batch — PR 639:** all 14 exact-head required checks
  passed. Physical/provider and unfinished bank-execution qualifications remain
  separately documented; this is not a claim every launch prerequisite is done.
- **Notification creator/item names — PR 640:** all 14 required checks passed.
  New server-generated wording and historical context need backend delivery;
  OTA alone cannot supply those server changes. Already-delivered system pushes
  cannot be rewritten.
- **Photo/gallery choices — PR 641:** all 14 required checks passed. Covers
  Manage Shop before draft save, Studio still-image inputs, and Profile/Settings
  presentation. Files remains separate. Installed Android/iOS presentation still
  requires device qualification.

These three PRs remain unmerged. No deployment is recorded here.

## Current source repair batch

- **Completed calls consuming retry allowance:** reproduced. Invite and direct
  room allocation credit now requires exact server-verified accepted-and-ended
  lifecycle proof. Unanswered attempts and unrelated room safeguards remain.
  Unknown legacy room allocations cannot be safely credited and expire normally.
  Source and focused SQL tests pass; final combined/native validation pending.
- **Contradictory call-error banners:** reproduced and source fixed. Definite
  throttling is not shown as an uncertain successful start; admitted retries
  clear the previous error.
- **Unknown call-start response ending a possibly committed call:** reproduced
  as a production-path failure class and source fixed. Atomic room/invite
  creation avoids charging failed allocation; unknown outcomes do not blindly
  terminate the candidate. Backend must precede the new client RPC path.
- **Live-tab controls:** source fixed. Preserve Start Live, replace Enter Code
  with matching Start Watch Party Live using its existing route, and remove the
  duplicate Explore button. Focused tests pass.
- **Eligible Circle lives missing specifically from Live tab:** reproduced and
  source fixed. Home already requested Circle data; Live did not. Private rooms
  are not made publicly discoverable.
- **Reported missing live notification/Home appearance:** recent observed room
  was private and not published for discovery; worker scheduling was enabled.
  This is evidence of eligibility exclusion, not proof of push malfunction.
  Actual installed delivery remains separate from source tests.
- **Per-person notification choice:** replaces the earlier automatic host-plus-
  Circle proposal. Profile controls choose Live starts, Watch-Party starts and
  explicitly opted-in joined-live activity. Existing defaults, global controls,
  relationship eligibility and private-room authorization remain. Source and
  focused independent review pass; combined validation pending.
- **Newest call/conversation first and unread highlighting:** reproduced;
  source fixed in `9d945b335`. Meaningful activity and previews are read-derived
  under RLS, newest calls are selected/rendered first, and message/call read
  boundaries remain separate. Snapshot/admission ordering prevents concurrent
  unseen records from being acknowledged. Focused SQL/mounted review passed;
  native concurrency and final combined validation remain pending. Natural
  chronology inside message/comment conversations is preserved.
- **Other activity ordering:** reproduced and source fixed: merged notification
  groups had unstable order, and millisecond cursor truncation could skip
  PostgreSQL microsecond records. 180 focused tests passed; combined validation
  pending. Deliberately ranked feeds and chronological replies are unchanged.
- **Missing iPhone chat Back control / inconsistent Back styling:** reported
  at 21:01 UTC with two screenshots. Reproduced missing custom control while
  Inbox suppresses the native header. Source fixed in `50310dcba` and
  `0766a0d6c`: shared
  arrow-only control, accessible label and touch target, visible Inbox exit in
  every state, cold-link fallback, and preserved room/call callbacks. Initial
  82 focused navigation/Inbox/Shop tests and typecheck passed. Combined
  validation and installed-device verification remain pending.

## Still unresolved

- **iPhone could not Answer:** the reported scenario started with the caller
  already on a cellular call. Server evidence shows video invitations ending
  without acceptance, but does not establish why the receiving phone failed.
  A receiving-device screenshot/recording or native trace was requested. No
  speculative native fix or physical Answer success is claimed. Cellular hold
  behavior itself was not reported as a separate defect.

## Delivery authorization and preserved work

- The earlier pause was superseded by the owner's 21:33 UTC instruction to
  merge and deploy all repairs. PR 638 merged as
  `44e121a17a7ebb6a38877c6c0df24eeefe355046`; the ready-for-review transition
  started fresh required checks for PRs 639–641. Each later merge still needs
  its exact-head validation and reviewed merge tree.
- At 21:54 UTC the owner approved scoped deployment CLI access and new internal
  Android/iOS builds. Public rollout and live payments remain excluded; extra
  build charges need confirmation after capacity verification.
- A selective V17 client candidate is saved separately. Source-native digests
  match V17, but the full merged stack contains V18 native changes and cannot
  be disguised as an OTA for the old binary. Backend-dependent client paths
  require their server migrations first.
- This document is the source-freeze issue snapshot, not a live deployment
  receipt. Provider access, final merge/build/rollout verification and physical
  qualification remain independent gates. No app delivery is claimed here.

Keep incoming reports as distinct entries. Do not reopen a verified item merely
because it has not yet been deployed, and do not close an unresolved device or
provider issue based only on mocked tests.
