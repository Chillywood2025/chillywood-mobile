# NEXT TASK

## Security Context Production Proof And UI Readout Lane

Security Request Context Backend Implementation is repo-side complete for the first slice: central table migration, shared Edge helper, Owner Security/admin audit linkage, temporary-grant revoke audit linkage, and LiveKit token request audit linkage.

True remaining gaps:

- Prove authorized owner/admin masked summary reads through `get_security_request_context_summary(uuid)` with a real owner/operator session after a safe context row exists. The linked Supabase project already has `202605230002_security_request_context_backend.sql` applied, anon select/insert denial against `security_request_context` returned `42501 permission denied`, and the only local password proof account available in this shell is non-staff/non-owner and correctly cannot read the audit/context rows.
- Prove the real server-side trusted IP header chain before setting `SECURITY_CONTEXT_TRUSTED_IP_HEADERS`. `SECURITY_CONTEXT_HASH_PEPPER` is configured and `SECURITY_CONTEXT_USE_DEFAULT_TRUSTED_IP_HEADERS=false` is explicitly set; spoofed client `x-forwarded-for` / `x-real-ip` / `cf-connecting-ip` proof returned `403`, but no authoritative real IP source is proved yet. Context rows must stay honest `capture_status = unavailable` and must not be presented as real network proof.
- Run physical/API owner/operator proof for the masked Owner Security and Audit Explorer network readouts. Owner Security and Audit Explorer are wired to safe masked summaries, but this shell only has a non-staff password proof account, which correctly cannot read audit/context rows.
- Add context links for the next safe backend event paths: DMCA intake/admin actions, Reports intake/admin actions, media-storage private access/upload-url actions, Live Ops operator actions, payout/revenue/fraud preflights, and SQL-only role/permission RPC paths where a backend request context can be safely captured.
- Add owner/operator-visible live proof that `livekit_token_request_audit` records success/denied token outcomes without storing token strings and without changing Watch-Party Live, Live Watch-Party, chat-call, or Premium behavior. A non-staff proof session produced a safe `400 invalid_body` denied response, but could not read the protected audit row, which is the correct access outcome for that account.
- Keep public content tables free of raw IP: profiles, channels, videos, comments, replies, chat messages, room messages, and room memberships should link only through restricted abuse/security/audit events when needed.
- Complete the prior Owner Security optional proof only if a safe staff-but-not-owner proof account is available: failed owner/admin access-attempt rows for staff-but-not-owner access. Regular non-staff denial and owner device trust/revoke audit proof are already complete.
