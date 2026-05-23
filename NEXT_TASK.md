# NEXT TASK

## Security Context Implementation Lane

Security Context and IP Address Audit is complete as a repo-truth planning pass. The next implementation lane should add the shared backend evidence path without adding raw IP columns to public/product tables.

True remaining gaps:

- Add a `security_request_context` migration with RLS, service-role/backend writes, masked owner/admin read RPCs, retention fields, and no normal-user/public reads.
- Add one shared Edge Function helper for trusted request context capture, IP normalization, server-side hashing, masked/prefix display, user-agent hashing, request id, source, and explicit unavailable states. Confirm trusted Supabase/proxy header precedence before using any IP header.
- Add nullable `security_context_id` references to backed audit/security event tables in phases: `platform_admin_audit_logs`, `security_audit_events`, `owner_trusted_devices`, role/permission audit, temporary grants, reports, DMCA, media/private upload actions, Live Ops, LiveKit token request/denial events, payout/revenue/fraud audit, and kill-switch/emergency action events.
- Keep public content tables free of raw IP: profiles, channels, videos, comments, replies, chat messages, room messages, and room memberships should link only through restricted abuse/security/audit events when needed.
- Update Owner Security and Audit Explorer to display masked network proof only after backend context exists; Audit overview should remain high-level and show no raw IP.
- Add proof that anon/normal users cannot read security context rows, mobile code does not submit trusted IP fields, public UI does not expose raw IP, and high-risk actions fail closed when policy requires context capture.
- Complete the prior Owner Security optional proof only if a safe staff-but-not-owner proof account is available: failed owner/admin access-attempt rows for staff-but-not-owner access. Regular non-staff denial and owner device trust/revoke audit proof are already complete.
