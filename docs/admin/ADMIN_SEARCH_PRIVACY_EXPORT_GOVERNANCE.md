# Admin Search Privacy Export Governance

Status: Admin search privacy and export governance: Closed / Partial / Blocked.

Verdict: Closed for repo-side Admin Search governance, support readback minimization, and export-default denial. Partial only for future monitoring automation around suspicious search pattern alerting and any future Owner-approved export lane. This lane does not add a Support backend role, does not broaden private evidence access, and does not enable exports by default.

Audit log integrity and privileged action evidence governance: Closed for current repo-side Admin Search audit integrity. Admin search queries are audited with masked query preview, failed/denied searches are audited where supported, audit readback requires exact scope, and search audit must not store plaintext email/private evidence/secrets.

Required launch truth:

- Admin search requires exact scope.
- Non-admin and unscoped attempts are denied.
- Searches are audited with masked query preview.
- Failed/denied searches are audited where supported.
- Search results are minimized.
- Search results are bounded/paginated or safely limited.
- Support-workflow readbacks are masked/minimized by default.
- Moderator does not see full email by default.
- Admin can see full email only with exact scope.
- Phone/device search is disabled by default unless future case-scoped privacy review approves it.
- Private chat/content evidence search requires exact scope and case/report/legal context.
- Payment/provider search is masked/scoped summary only.
- Deleted/de-identified users are not available in ordinary search.
- Exports are disabled by default and require future Owner-approved audited lane.
- No secrets, raw storage paths, signed URLs, raw IPs, tokens, push tokens, provider secrets, tax IDs, bank details, private provider IDs, raw payment credentials, or private evidence are exposed.

## Search Authority Matrix

| Search/readback surface | Allowed? | Who can search? | Required scope | Case/report context required? | Full or masked result? | Rate-limited/bounded? | Audited? | Failed search audited? | Export allowed? | Notes/blockers |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Email search | Yes, exact-scope only | Owner/First Owner and Admin with exact user/support scope | `admin.user.search` plus user/support read scope | No for directory support lookup; yes if tied to private evidence | Full email only for exact Admin/Owner scope; support readback is masked by default | Minimum length, debounce, and safely limited results | Yes, masked query preview | Yes where audit RPC is reached | No | Email plaintext is not stored in search audit metadata. |
| Username/handle search | Yes | Owner/First Owner, Admin, and scoped support/moderation workflows | `admin.user.search`, support, or moderation case scope | No for public username lookup; yes for private evidence | Public username/handle plus minimized account summary | Minimum length, debounce, and safely limited results | Yes | Yes where supported | No | Preferred first-line support lookup. |
| Phone search | No by default | None in ordinary Admin Search | Future privacy/security approval required | Yes if ever approved | Masked only if future lane approves | Not enabled | Would be required | Would be required | No | Phone/device search is disabled by default unless future case-scoped privacy review approves it. |
| Device search | No by default in Admin Search | Owner security device trust surfaces only, not ordinary search | Owner security scope if using device-trust view | Yes for security incident context | Masked device hash/label only | Bounded to security readbacks | Security actions audited where supported | Yes where supported | No | No raw device identifiers or raw IPs in ordinary Admin Search. |
| Profile search | Yes, minimized | Owner/First Owner, Admin, scoped support/moderation | User/support/moderation scope | No for public profile summary; yes for private fields | Minimized public/profile summary; private fields exact-scope only | Safely limited | Yes when using Admin Search | Yes where supported | No | Does not broaden public visibility. |
| Private content search | Case-scoped only | Owner/First Owner/Admin/Moderator only with exact evidence scope | Content/evidence/legal scope | Yes | Evidence-safe preview only; no arbitrary browse | Case-scoped and bounded | Yes | Yes where supported | No | Private content/chat evidence search requires exact scope and case/report/legal context. |
| Chat/thread/message evidence search | Case-scoped only | Owner/First Owner/Admin/Moderator with exact chat evidence scope | `admin.chat_evidence.view` or legal evidence equivalent | Yes | Message bodies/evidence only inside exact case context; ordinary results avoid private content | Case-scoped and bounded | Yes | Yes where supported | No | Staff cannot browse arbitrary private chats. |
| Report/case search | Yes | Owner/First Owner, Admin, Moderator with review scope | Reports/moderation/legal scope | Report/case id required for private evidence | Reporter identity private by default; minimized queue fields | Bounded queue/read model | Yes where supported | Yes where supported | No | Reported users are not notified merely because a report was filed. |
| Support case search | Yes | Owner/First Owner, Admin, scoped support workflow; Moderator only with exact support scope | Support/workflow scope | Case context required for private data | Masked/minimized by default | Bounded | Yes where supported | Yes where supported | No | Support is a work area, not a backend role. |
| Payment/provider status search | Read-only summary only | Owner/First Owner/Admin with exact money-support scope; Moderator only with exact safe-summary scope | `admin.payment_status.view` or approved money-support summary scope | Support/access case required when tied to a user | Masked/scoped summary only | Safely limited | Yes where supported | Yes where supported | No | No refunds, purchases, payouts, or provider mutations. |
| RevenueCat customer/order summary search | Read-only summary only | Owner/First Owner/Admin with exact money-support scope | Money-support summary scope | Support/access case required | Masked/scoped summary only | Safely limited | Yes where supported | Yes where supported | No | No raw RevenueCat customer data. |
| Google Play order summary search | Read-only summary only | Owner/First Owner/Admin with exact money-support scope | Money-support summary scope | Support/access case required | Masked/scoped summary only | Safely limited | Yes where supported | Yes where supported | No | No full Google Play order data. |
| Deleted user lookup | Not ordinary search | Owner/First Owner/Admin only through retention/legal/support path if policy allows | Legal/account retention scope | Yes | Minimized retention readback | Bounded | Yes | Yes where supported | No | Deleted users are not available in ordinary search. |
| De-identified user lookup | Not ordinary search | Owner/First Owner/Admin only through retention/legal audit if policy allows | Legal/account retention scope | Yes | De-identified/minimized audit pointer only | Bounded | Yes | Yes where supported | No | De-identified users are not broadly searchable. |
| Audit log search | Yes, scoped | Owner/First Owner/Admin with audit scope; Moderator only if exact scope allows | Audit/security/legal scope | Reason/context required for sensitive reviews | Masked event metadata; no raw private payloads | Safely limited | The lookup itself is audited where supported | Yes where supported | No | Search audit stores masked query preview, not plaintext email/private evidence. |
| Export search results | No by default | Future Owner-approved lane only | Future exact export scope plus privacy review | Yes | Future export would be minimized/redacted | Future bounded export only | Required | Required | Disabled | Exports are disabled by default and require future Owner-approved audited lane. |

## Result Minimization Matrix

| Result type | Default readback | Full value allowed? | Scope/context rule |
| --- | --- | --- | --- |
| Email | Masked email in support/moderation readbacks | Admin/Owner exact user/support scope only | Moderator does not see full email by default. |
| Username/handle | Visible if already product-visible | Yes when public/profile-safe | Keep as preferred support lookup. |
| User id | Compact identifier only | Full internal ids stay out of user-facing copy | Staff tools use internal ids only as backed targets. |
| Phone/device | Not returned in ordinary search | No by default | Future privacy/security lane only. |
| Chat/private content | Not returned in ordinary search | Exact evidence scope plus case/report/legal context only | No arbitrary staff private-chat browsing. |
| Payment/provider | Masked/scoped summary only | Raw provider data not shown | Support/access case plus exact scope. |
| Deleted/de-identified accounts | Hidden from ordinary search | Retention/legal pointer only if policy allows | Preserve purge/de-identification policy. |

## Export Policy Matrix

| Export surface | Current state | Approval required | Reason/audit required | Privacy rule |
| --- | --- | --- | --- | --- |
| Admin Search result export | Disabled by default | Future Owner/First Owner-approved lane | Required | Must be minimized/redacted and privacy-reviewed before any launch. |
| Support readback export | Disabled by default | Future Owner approval | Required | No private evidence, raw email lists, provider records, or raw ids by default. |
| Legal evidence export | Separate exact-scope legal workflow | Owner or scoped legal/evidence permission | Required | Case/legal target only; not bulk Admin Search export. |
| Payment/provider export | Disabled | Future Owner approval plus money/privacy review | Required | No raw provider transaction/customer/order data. |

## User / Email / Username Search Rules

Email search may be used for Owner/Admin support operations only with exact scope. Support-workflow readbacks are masked/minimized by default, and search audit stores a masked query preview instead of plaintext email. Username/handle search is preferred where it can resolve the issue without exposing private contact data. Non-admin and unscoped attempts are denied, and failed/denied searches are audited where supported.

## Phone / Device Search Policy

Phone/device search is disabled by default unless future case-scoped privacy review approves it. Owner security device-trust views may show masked device labels, short device hashes, and masked network proof where already backed, but ordinary Admin Search must not expose raw phone numbers, raw device identifiers, raw IPs, push tokens, LiveKit tokens, or hardware fingerprints.

## Private Content / Chat Evidence Search Policy

Private chat/content evidence search requires exact scope and case/report/legal context. Staff cannot browse arbitrary private chats. Private message bodies, attachments, report evidence, and legal evidence stay case-scoped and audit-backed. The search UI must not expose raw thread/message ids, raw storage paths, signed URLs, tokens, private evidence, or reporter identity.

## Payment / Provider Search Policy

Payment/provider search is masked/scoped summary only. Provider transaction/customer/order data is minimized for support readback and must not reveal raw provider transaction IDs, RevenueCat private customer data, Google Play full order records, provider secrets, tax IDs, bank details, payment credentials, private dashboard data, or private provider IDs. Search/readback never executes purchases, refunds, payouts, product changes, RevenueCat mapping changes, or money activation.

## Support / Moderator Masked-Readback Policy

Support is a work area, not a role. Support-workflow users see masked/minimized fields by default. Moderator does not see full email by default and can only use support/moderation-scoped readbacks with exact permissions and case context where private evidence is involved. Admin can see full email only with exact scope.

## Deleted / De-identified User Lookup Policy

Deleted/de-identified users are not available in ordinary search. Limited Owner/Admin legal, account-retention, audit, or support readback may exist only where the account deletion, purge/de-identification, legal/security/payment/support/moderation retention policy allows it. These readbacks stay minimized, scoped, reasoned where sensitive, and audited where supported.

## Audit / Suspicious Search Model

Searches are audited with actor, scope, query type, masked query preview, result count, status, timestamp, and result reference where supported. Search audit must not store plaintext email search text, private evidence, secrets, raw provider records, raw payment credentials, tokens, signed URLs, raw IPs, tax IDs, bank details, or reporter identity.

Suspicious search patterns are flagged or documented for monitoring follow-up:

- repeated email guessing;
- high-volume user searches;
- payment/provider lookup bursts;
- private evidence lookup without case context;
- moderator attempts to access Admin-only search;
- export attempts;
- deleted/de-identified user lookup attempts outside retention context.

## UI / Backend Denial Model

The Owner/Admin Command Center remains the production staff entry point. Search tools are visible only when the actor has the exact scope for the selected search slice. Unavailable search types are hidden or honestly disabled. Export buttons for Admin Search remain hidden/disabled because exports are disabled by default. Backend audit/permission checks remain the authority if UI is bypassed. User-facing errors use safe copy and must not show raw backend, SQL, provider, or internal RPC names.

## Existing Proof References

- `docs/admin/OWNER_ADMIN_COMMAND_CENTER_PRODUCTION_UI.md`
- `docs/OWNER_ADMIN_SEARCH_PERMISSION_AUDIT_HARDENING.md`
- `docs/admin/ADMIN_ROLE_SCOPE_AND_PERMISSIONS.md`
- `docs/admin/MODERATOR_ROLE_SCOPE_AND_SUPPORT_DUTIES.md`
- `docs/legal/LEGAL_PRIVACY_DATA_SAFETY_FINAL_ALIGNMENT.md`
- `docs/monitoring/MONITORING_ANALYTICS_CRASH_RUNTIME_DIAGNOSTICS.md`
- `docs/account/ACCOUNT_RESTRICTION_APPEALS_OPERATIONS.md`
- `docs/admin/MONEY_ADMIN_AUTHORITY_ACTIVATION_GOVERNANCE.md`

## Launch Status

Admin search privacy and export governance is closed for current repo readiness once `proof:admin-search-privacy-export-governance` and `guard:admin-search-privacy-export-policy` pass. Future bulk export, phone/device lookup, and automated suspicious-search alerting must remain separate Owner-approved lanes.
