# NEXT TASK

## Security Context Production Proof And UI Readout Lane

Security Request Context Backend Implementation is repo-side complete for the first slice: central table migration, shared Edge helper, Owner Security/admin audit linkage, temporary-grant revoke audit linkage, and LiveKit token request audit linkage.

True remaining gaps:

- Prove authorized owner/admin masked summary reads through `get_security_request_context_summary(uuid)` after a safe context row exists. The linked Supabase project already has `202605230002_security_request_context_backend.sql` applied, and anon select/insert denial against `security_request_context` returned `42501 permission denied`.
- Configure and prove server-side `SECURITY_CONTEXT_TRUSTED_IP_HEADERS` and `SECURITY_CONTEXT_HASH_PEPPER`; until both are set, context rows are honest `capture_status = unavailable` and should not be presented as real network proof.
- Add Owner Security / Audit Explorer readout UI for masked IP/network proof using `get_security_request_context_summary(uuid)`; Audit overview should remain high-level and should not show raw IP.
- Add context links for the next safe backend event paths: DMCA intake/admin actions, Reports intake/admin actions, media-storage private access/upload-url actions, Live Ops operator actions, payout/revenue/fraud preflights, and SQL-only role/permission RPC paths where a backend request context can be safely captured.
- Add live proof that `livekit_token_request_audit` records success/denied token outcomes without storing token strings and without changing Watch-Party Live, Live Watch-Party, chat-call, or Premium behavior.
- Keep public content tables free of raw IP: profiles, channels, videos, comments, replies, chat messages, room messages, and room memberships should link only through restricted abuse/security/audit events when needed.
- Complete the prior Owner Security optional proof only if a safe staff-but-not-owner proof account is available: failed owner/admin access-attempt rows for staff-but-not-owner access. Regular non-staff denial and owner device trust/revoke audit proof are already complete.
