# Owner/Admin Control Tools

## Scope
- Adds protected Admin control tools on top of the owner superuser and scoped staff foundation.
- Admin UI must follow `docs/APP_UI_UX_RULES.md`: compact command-center layout, real summary cards/counts, grouped actions, production states, exact disabled reasons, no raw debug primary UI, no dead buttons, and no fake proof/demo rows in production mode.
- Does not change Live Stage, Watch-Party Live, Player, Chat/call UI, normal Premium gates, or owner invisibility.
- Owner normal access remains unrestricted and is not app-level audited unless Owner manually activates Break Glass.

## Tools
- Audit Explorer reads normalized audit rows through `admin-owner-controls`.
- Permission Templates grant permission-only bundles and never create staff roles.
- Temporary grants use `platform_staff_permission_grants.expires_at` as the server-side source of truth.
- Break Glass is off by default, reason-required, and writes append-only Break Glass audit rows.
- First Owner authority is enabled through `platform_first_owner_authority`: Only First Owner can grant or revoke Owner, First Owner cannot remove himself as the last active Owner, and First Owner self-step-down requires successor, password re-auth, generated single-use passcode, typed confirmation, reason, and audit.
- The single top-level Legal tab contains Intake, Evidence, Holds, Requests, Exports, and Timeline/History sections where backed. Legal Request Intake stores non-deletable intake records connected to Legal Evidence work.
- DMCA Case Management handles copyright notice intake, case detail, content actions, strikes, counter-notices, and functional case history.
- Owner Security Center is Owner-only and backed by `owner_trusted_devices`, `security_audit_events`, temporary grant read/revoke paths, security audit timeline readouts, Live Ops flag readouts, and checklist proof. It must show unavailable/manual when a source cannot be proved, not fake zeroes.
- Owner/Admin Money Center is the single admin money control surface. It consolidates Premium, RevenueCat/Google Play readiness, sponsors/ads, fraud/risk, ledger/revenue, payouts/Stripe Connect, provider webhooks, kill switches, audit, and technical checks into collapsible sections. It uses backend Money switch RPCs plus sanitized provider readiness and cannot create checkout, payouts, transfers, balances, fake money, or live-money movement.
- Canary Checks store pass/fail/manual-required results; manual required is not success.
- Safety Dashboard shows only real counts and unknown/manual for missing aggregations.

## Production Proof
- `admin-owner-controls` is deployed on Supabase project `bmkkhihfbmsnnmcqkoly` as ACTIVE version 27. `admin-legal-evidence` is deployed as ACTIVE version 7.
- The May 21, 2026 physical Android owner-device legal-readiness proof on `R5CR120QCBF` ran Admin Canary from the Admin Command Center and returned `33 pass`, `0 manual`, and `0 failed`.
- The May 22, 2026 physical Android owner-device release proof on `R5CR120QCBF` returned `60 pass`, `0 manual_required`, and `0 failed` after the hosted public DMCA URL, public form intake, private attachment upload/access denial, uploader counter-notice self-service, email-intake mode, and content mutation matrix checks were added.
- The May 22, 2026 physical Android owner-device Legal Intake / Legal Evidence release proof on `R5CR120QCBF` returned `65 pass`, `0 manual_required`, and `0 failed`. It proved one Legal top-level Admin tab with Legal Intake inside Legal; request list/create/open/status/timeline/evidence linkage; owner normal Legal Intake without a reason prompt; scoped Admin Legal Evidence preview/export/hold enforcement; ungranted Admin, moderator, regular viewer, and signed-out server-side denial where applicable; target-matrix coverage; and proof grant cleanup.
- The May 22, 2026 local / May 23 UTC Owner Security Center production hardening is deployed/proved for backend, non-owner denial, and owner device-trust mutation. It adds migration `202605230001_owner_security_center_hardening.sql` on top of `202605220004_owner_security_center.sql`, returns per-source security telemetry states, separates connected-empty from disconnected sources, exposes current-device proof/hash metadata, locks emergency actions unless backend owner truth plus trusted current device are proved, and requires reason plus exact typed confirmation for device/grant revokes. Physical Android `R5CR120QCBF` release proof with the configured non-staff proof account showed `/admin` denial and no Owner Security/Security Backend leakage; direct backend proof returned zero visible owner security rows and `403 staff_role_required` for security overview and dangerous revoke. A signed-in owner session on `R5CR120QCBF` then proved Owner Access `Verified`, Current Device `Not Recorded` to `Trusted`, Emergency Actions `Locked` to `Available`, exact `UNTRUST DEVICE` plus reason enforcement, successful current-device untrust, and Emergency Actions returning to `Locked`. Linked Supabase proof found `owner_device_trusted` and `owner_device_revoked` rows in `security_audit_events`, plus the matching `owner_trusted_devices.revoked_reason`, and the drill left no active trusted-device state behind.
- The production proof harness creates or reuses clearly marked `liveops.proof+...` accounts through Supabase Admin/service-role tooling, signs them in server-side only, grants temporary proof roles/permissions only for the run, and verifies no active proof roles/grants remain afterward.
- The canary proves owner normal no-audit behavior by comparing owner-sensitive app-level audit counts before and after normal canary use; owner actions are only app-level audited when Break Glass is active.
- The canary proves admin self-grant denial through the real staff-permission RPC and moderator grant denial through the real role-management RPC.
- The canary proves Legal Intake and Legal Evidence restriction for ungranted users/admins and exact-grant access where applicable.
- The canary proves Live Ops remains dry-run with real-action flags disabled through the ops health contract.
- The canary proves Supabase hosted Auth redirect configuration through a server-side management-token secret; token values are never shown in mobile UI, docs, logs, or committed files.
- The legal readiness portion proves the production policy bundle word counts, creator license clause, upload acknowledgement, live/replay acknowledgement, Google Play deletion language, DMCA checklist, support email/path, and public-link-or-bundled fallback.
- The DMCA readiness portion proves DMCA tables, real case detail, manual formal notice intake, public hosted URL reachability, public form anon submission with Admin readback, content action recording, strike add/dispute/resolve, counter-notice recording/forwarding/restore eligibility, filters/search, no dead backing checks, proof/demo production hiding, owner/scoped-operator access, and server-side unauthorized denial.
- The public/legal DMCA portion also proves private evidence attachments through the `dmca-evidence` bucket, metadata RPC, Admin readback, and anonymous download denial; new attachment records now queue `pending_scan` / `clamav`, with production scanner coverage pending worker deployment proof. Automated inbound email ingestion is not configured, so support/admin manual intake remains the live path. Uploader-facing counter-notice self-service is live for the authenticated affected uploader and denied for other users, while Admin recording/forwarding/restore-window workflows remain supported.
- The content mutation matrix passes for `creator_video`, `profile_post`, `profile_post_comment`, `comment`, `creator_video_comment`, `reply`, `social_attachment`, and `attachment`; `live_room`, `channel`, and `other` are preserve-only/disabled with exact missing-backend reasons and no LiveKit action.

## Access
- Owner can see all tools.
- Audit Explorer and Canary require Owner or `audit_review` / `security_review`.
- Permission Templates require Owner or `staff_permission_templates` / `admin_grants`; Admins cannot template-grant themselves.
- Break Glass requires authenticated First Owner. Normal Owner dashboard viewing is not Break Glass.
- Legal Intake requires Owner or `legal_request_intake` / `legal_review` / `legal_ops`.
- Legal Evidence preview/search requires Owner or `legal_review` / `evidence_preview` / `legal_ops`; export requires Owner or `evidence_export` / `legal_ops`; hold requires Owner or `legal_hold` / `legal_ops`.
- DMCA Case Management requires Owner or Admin/operator with `dmca_review`, `copyright_review`, or `legal_review`.
- Owner Security is Owner-only.

## Templates
- Support Agent: `support_inbox`, `user_lookup`
- Moderator: `reports_review`, `content_moderation`
- Senior Moderator: `reports_review`, `content_moderation`, `user_lookup`
- Live Ops Operator: `live_ops`
- DMCA Reviewer: `dmca_review`, `copyright_review`, `legal_review`
- Legal Reviewer: `legal_review`, `evidence_preview`, `legal_request_intake`, `dmca_review`, `copyright_review`
- Legal Operator: `legal_ops`, `legal_request_intake`, `evidence_preview`, `evidence_export`, `legal_hold`, `legal_review`
- Evidence Exporter: `evidence_preview`, `evidence_export`, `legal_request_intake`
- Creator Support: `creator_support`, `support_inbox`, `user_lookup`

## Safety Notes
- The Edge Function keeps service-role access server-side.
- No secrets are returned to the app.
- First Owner controls are enabled for authenticated First Owner after validation.
- No secrets, tokens, signed URLs, raw IPs, tax IDs, bank details, or provider secrets are exposed.
- Legal Intake has no delete action.
- Legal request records, evidence records, exports, holds, and legal request timelines are functional case records. Normal Owner Legal work does not require Break Glass or owner-sensitive app-level audit rows.
- DMCA case history, notices, content actions, counter-notices, and strike records are functional case records. Normal Owner DMCA work does not require Break Glass or owner-sensitive app-level audit rows.
- Owner Security device trust rows, temporary grant state, security events, checklist proof, and emergency action history are functional security records. Normal Owner read use does not require reason prompts. Dangerous Owner Security mutations, including device trust revoke and temporary-grant revoke/bulk revoke, require backend Owner authority, backend-trusted current device, reason, exact confirmation phrase, and immutable security audit proof.
- Network/IP proof now has backend plumbing through `security_request_context`, `security_context_id`, and `supabase/functions/_shared/security-request-context.ts`. Migration `202605230002_security_request_context_backend.sql` is applied, and `admin-owner-controls` ACTIVE version `30` attaches context ids to Owner Security security events, Owner device rows, temporary-grant revoke audit, platform audit rows it writes, and Audit Explorer readouts for linked audit rows. Event-link migration `202605230003_security_context_event_link_expansion.sql`, validator fix `202605230004_fix_security_context_metadata_validator.sql`, and trusted proxy contract migration `202605230005_trusted_network_proof_contract.sql` are applied; they extend nullable context links to restricted DMCA, Reports, media-storage, Live Ops, Live Cost Guard, payout/network/fraud, and staff role audit tables while tracking signed proxy proof state. Deployed Edge functions for LiveKit token audit, Live Ops Fix Center, Live Cost Guard, media-storage, and payout/provider/sponsor/fraud preflights attach context where backend capture exists. Direct `x-forwarded-for`, `x-real-ip`, `forwarded`, `x-client-ip`, and `cf-connecting-ip` are ignored as spoofable; only signed `x-chillywood-network-proof*` headers verified with `CHILLYWOOD_NETWORK_PROOF_SECRET` may set `network_proof_verified=true` and `trusted_header_source=signed_chillywood_proxy`. The trusted Cloudflare Worker proxy is deployed from `ops/trusted-network-proof-proxy/` to `https://network-proof.chillywoodstream.com`, with the proof secret configured in both Cloudflare and Supabase and a Worker-only hash pepper configured in Cloudflare. App runtime now routes Supabase Edge function calls, the default LiveKit token endpoint, and media-storage function calls through that proxy; Auth/REST/storage stay direct Supabase. Owner Security current/trusted device rows and Audit Explorer rows may show masked network proof from the safe summary RPC when linked context exists, public UI must never expose raw IP, and physical Android owner-session proof on `R5CR120QCBF` showed a verified masked `/24` prefix plus approximate location/ISP and signed-proxy source without raw IP.
- Production clients hide proof/demo DMCA cases marked `is_test_case`; dev clients may show them with a clear test badge.
- Canary checks that need unavailable proof accounts, ops health contracts, or Supabase Management API access return manual required, not pass.
- Owner normal functional records, such as active permission grants, may exist because the system needs them; they are not shown as app-level owner audit unless Break Glass is active.
