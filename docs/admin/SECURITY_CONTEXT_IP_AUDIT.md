# Security Context And IP Address Audit

Date: 2026-05-23

Lane: Security Context and IP Address Audit / Security Request Context Backend Implementation

Purpose: record repo-backed truth for IP address, request metadata, device trust, session, audit, fraud, live ops, upload, report, payout, and admin security logging. The original audit was planning-only. The first backend slice is now implemented by migration `202605230002_security_request_context_backend.sql` plus shared Edge helper `supabase/functions/_shared/security-request-context.ts`.

## Backend Implementation Status

Implemented, Supabase-applied, and Edge-deployed in the first production slice:

- `security_request_context` central restricted table for hashed/masked request context.
- No raw `ip_address` or raw `ip_address_encrypted_or_restricted` column was added because the repo does not yet have an approved encryption/restricted raw-IP pattern.
- `security_context_id` linkage on `platform_admin_audit_logs`, `security_audit_events`, and `platform_staff_permission_audit`.
- `owner_trusted_devices.last_security_context_id` for current-device trust ledger linkage.
- `livekit_token_request_audit` append-only table for token request outcomes without token storage.
- `get_security_request_context_summary(uuid)` safe summary RPC for future Owner Security / Audit Explorer UI.
- `admin-owner-controls` captures a backend request context once per action and attaches it to Owner Security audit, Owner device trust/revoke, temporary grant revoke, and platform audit writes from that Edge Function.
- `admin-owner-controls` now enriches Owner Security current/trusted device rows with safe masked `networkProof` from `get_security_request_context_summary(uuid)` when `last_security_context_id` exists; the full security context id is not returned to the mobile UI.
- Audit Explorer now receives safe masked network proof for authorized audit rows with `security_context_id`, can filter for rows with or without linked proof, and includes `livekit_token_request_audit` rows without exposing tokens.
- `livekit-token` captures backend request context and writes token request audit rows for success/denied/error outcomes without changing room routing, grants, tokens, or Premium gates.
- Remote proof confirmed migration `202605230002` is applied, `admin-owner-controls` is ACTIVE version `26`, `livekit-token` is ACTIVE version `63`, and anon select/insert against `security_request_context` returns `42501 permission denied`.

Trusted IP capture is intentionally conservative:

- The helper reads IP only from backend-configured trusted headers through `SECURITY_CONTEXT_TRUSTED_IP_HEADERS`.
- Defaults are not trusted unless `SECURITY_CONTEXT_USE_DEFAULT_TRUSTED_IP_HEADERS=true` is explicitly set server-side. The linked project now explicitly sets `SECURITY_CONTEXT_USE_DEFAULT_TRUSTED_IP_HEADERS=false`.
- `SECURITY_CONTEXT_HASH_PEPPER` is required before a real captured IP is hashed. The linked project now has this secret configured, but no trusted IP header is configured yet. Until the proxy/header chain is verified, context rows remain linked but marked `capture_status = unavailable` with `Not captured` masked proof.
- Mobile payloads are never used as trusted IP/network source.

## Proxy/Header Proof Status

Current closeout result: trusted network proof is not verified yet, so real IP capture remains fail-closed.

- The deployed request path for this slice is Supabase Edge Functions on project `bmkkhihfbmsnnmcqkoly`. There is no app-owned Cloudflare, Hetzner, or custom proxy in front of those function URLs in repo truth.
- Supabase's edge gateway/proxy may inject request metadata, but this repo has not proved a specific authoritative IP header that cannot be spoofed or overwritten by the mobile client.
- `SECURITY_CONTEXT_HASH_PEPPER` is configured, and `SECURITY_CONTEXT_USE_DEFAULT_TRUSTED_IP_HEADERS=false` is configured.
- `SECURITY_CONTEXT_TRUSTED_IP_HEADERS` is intentionally unset. Therefore `x-forwarded-for`, `x-real-ip`, `forwarded`, and `cf-connecting-ip` are not trusted by Chi'llywood code.
- A proof request that attempted to send spoofed `x-forwarded-for`, `x-real-ip`, and `cf-connecting-ip` headers to `livekit-token` returned `403` before a normal token/audit read path. That is useful evidence that spoofed client headers are not an accepted proof path, but it is not enough to declare a trustworthy real IP source.
- Until Supabase/platform documentation plus live owner/operator proof identifies a safe source, Owner Security and Audit Explorer must show `Network proof not verified` / `Not captured` style states rather than `Real IP verified`.

## Governing Decision

IP and network proof belongs in a shared backend security evidence path, not scattered across product tables.

- The mobile client must never supply trusted IP/network proof.
- Edge Functions or trusted backend request context must be the source of truth.
- Public UI must never show raw IP addresses.
- Admin UI may show only masked network proof where the operator is authorized.
- Raw IP should be avoided in v1 unless a legal/security decision explicitly requires restricted encrypted retention.
- High-risk action tables should reference one `security_context_id` rather than duplicating IP fields.

## Existing State

| Capability | Repo truth | Current classification |
| --- | --- | --- |
| IP capture | `security_request_context` and shared Edge helper now exist. The hash pepper is configured, default trusted headers are disabled, and real IP capture still requires a proved trusted server header before any captured network proof is claimed. | Partially implemented / fail-closed |
| IP hashing | `security_request_context.ip_hash` is populated by the helper with a peppered hash only when trusted IP capture is configured; legacy `platform_admin_audit_logs.ip_hash` and `dmca_cases.submitted_ip_hash` remain hash-only fields and are not the new source of truth. | Partially implemented |
| Masked IP display | Owner Security and Audit Explorer display masked/current-device/audit-row network proof from the safe summary path when linked context exists. The high-level Audit tab and public UI do not display network proof. | Partially implemented |
| Raw IP storage | No raw `ip_address` column was found in app-owned migrations. | Already avoids raw IP |
| User-agent hashing | `platform_admin_audit_logs.user_agent_hash` and `dmca_cases.submitted_user_agent_hash` exist. No shared writer was found. | Partially present / not wired |
| Device hash/session tracking | Owner Security stores `owner_trusted_devices.device_fingerprint_hash`, app/build/platform metadata, trusted/revoked state, and last seen. The hash is derived from authenticated user plus client device/app context, not backend network context. | Partially safe |
| Security context table | `security_request_context` exists with RLS and no anon/authenticated direct table read grants. Safe masked summary is available through `get_security_request_context_summary(uuid)`. | First slice implemented |
| Admin audit events | `platform_admin_audit_logs` is append-only, backs Admin Audit overview, and now has nullable `security_context_id`. `admin-owner-controls` platform audit writes attach context ids. Other writers remain future work. | Partially implemented |
| Immutable audit events | Admin audit rows are append-only; Owner Security also has append-only `security_audit_events`. | Already safe for event integrity |
| Failed access events | Owner Security writes `owner_security_access_denied` events for owner-only actions where backed. Staff-but-not-owner failure proof remains a separate prior gap. | Partially safe |
| Owner device trust | `owner_trusted_devices` and Owner Security RPC paths are owner-only, backend written, proof-backed, now support `last_security_context_id`, and return masked `networkProof` through `admin-owner-controls` without exposing raw context ids or raw IP. | Partially implemented |
| Temporary grant audit | Temporary scoped grants use `platform_staff_permission_grants.expires_at`; Owner Security revoke paths now attach `security_context_id` to security/staff-permission audit rows where the Edge context exists. | Partially implemented |
| Live Ops security events | Live Ops Fix Center and Live Cost Guard have action/event/audit tables and service-role Edge writes where applicable. No network proof is attached. | Partially safe |
| LiveKit token request events | `livekit_token_request_audit` records success/denied/error outcomes, surface/action, safe room hashes, publish grant booleans, actor id, and `security_context_id`. It never stores LiveKit tokens. | First slice implemented |
| Payout/revenue security events | Payout/provider/fraud/revenue foundations write admin/audit rows and keep live money closed. No shared security context exists. | Partially safe |
| Reports/moderation context | `safety_reports` and reports moderation audit exist. No security context id or trusted IP path was found. | Missing context |
| DMCA context | DMCA cases include submitted hash columns, but public notice submission currently sends payload to RPC from the client and no trusted request-context writer was found. | Partially safe / needs backend-only capture |
| Comments/replies context | Comment/reply tables and helpers do not store raw IP or security context. | Should not store IP on content rows |
| Upload/media context | Creator video upload and media-storage helpers audit some private media access, but no request context is attached. | Missing context for high-risk media actions |
| Chat abuse context | Chat messages and room messages do not store raw IP or security context. | Should not store IP on chat rows |
| Fraud/suspicious activity | Fraud foundation tables and audit logs exist, but no shared network context or hash-pattern evidence table exists. | Partially safe |

## Gap Map

| System | Classification | Recommended action |
| --- | --- | --- |
| Auth/sign-in/sign-out/session refresh | Needs backend-only capture for app-owned high-risk events; Supabase Auth provider logs are outside repo truth | Do not store IP in profile/session UI. Capture security context only when an app-owned Edge/RPC security event is created. |
| Owner Security | Partially implemented | Device trust, device revoke, temporary grant revoke, and Edge-written security/platform audit rows can attach `security_context_id`; failed owner access and emergency-action coverage remain path-specific follow-up. Show masked network proof only. |
| Device trust | Partially safe | Keep device fingerprint hash. Add last security context reference for current-device proof and trusted-device ledger rows. |
| Admin audit | Partially safe | Prefer `security_context_id` on future audit rows. Keep legacy `ip_hash`/`user_agent_hash` read-restricted or backfill only if needed. |
| Audit Explorer | Partially implemented | Owner/admin-scoped audit rows with `security_context_id` now include masked network proof from the safe summary path. No raw IP. Owner/operator live read proof remains pending until a usable owner/operator session is available in the proof shell. |
| Roles/users/premium admin changes | Missing security_context_id | Attach context for role grant/revoke, scoped permission updates, premium overrides, and owner/admin sensitive user changes. |
| Temporary grants | Partially implemented | Owner Security temporary-grant revoke paths attach context where available; grant create and expiry sweeps remain follow-up where a request actor exists. |
| Kill switches | Needs backend-only capture | Future kill switch/emergency lock writes must require trusted device where policy says so and attach context. Read-only UI needs no IP. |
| Live Ops / Live Cost Guard | Partially safe | Attach context to operator-approved actions and high-risk attempts. Cost/event telemetry can stay source metadata without user IP. |
| LiveKit token issuance | First slice implemented | `livekit_token_request_audit` records token request outcomes with `security_context_id` where capture is available. Real trusted-header proof and owner/operator live audit read proof remain pending. |
| Watch-Party Live | Should not store IP in room tables | Attach context at token issuance, speaker approval/high-risk room actions, and room abuse reports only. |
| Live Watch-Party | Should not store IP in room tables | Same as Watch-Party Live: context on token/security events, not membership/chat content rows. |
| Uploads / creator videos | Missing security_context_id | Attach context to upload-url creation, publish/unpublish/delete, takedown, and private media access audit. Do not put raw IP on `videos`. |
| Comments / replies | Should not store IP | Keep public content rows free of IP. Attach context to report/abuse/moderation events if needed. |
| Reports / moderation | Missing security_context_id | Report intake and admin report actions should create context from backend request and link to report/audit rows. |
| Chat abuse surfaces | Should not store IP on messages | Attach context to abuse reports, block/escalation events, and future anti-spam backend actions. |
| Payouts / revenue | Missing security_context_id | Attach context to payout preflight, provider account actions, release attempts, premium overrides, source imports, and fraud review actions. |
| Fraud / suspicious activity | Partially safe | Use hashed context patterns and aggregate risk signals. Fraud UI should show pattern/risk summaries, not raw IP. |

## Recommended Architecture

The first backend implementation now uses one shared restricted table:

```sql
create table public.security_request_context (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  session_id_hash text,
  device_hash text,
  ip_hash text not null,
  ip_prefix_or_masked_ip text,
  country text,
  region text,
  city_approx text,
  asn_or_isp text,
  user_agent_hash text,
  request_id text,
  source text not null,
  created_at timestamptz not null default timezone('utc', now()),
  retention_expires_at timestamptz
);
```

Implementation notes:

- Confirm the trusted Supabase/Edge request IP source before setting `SECURITY_CONTEXT_TRUSTED_IP_HEADERS`. Candidate proxy headers like `x-forwarded-for`, `x-real-ip`, or `cf-connecting-ip` must be accepted only when supplied by trusted platform infrastructure, never from mobile payloads.
- Hash normalized IP with the server-side pepper/secret that never leaves Edge/backend infrastructure.
- Prefer not storing raw IP in v1. If raw IP is legally required, encrypt or restrict it behind service-role/owner-security RPCs and short retention.
- Keep RLS denying anon and normal authenticated users. Writes should be service-role/backend only. Reads should go through safe RPCs returning masked fields only.
- Keep indexes on `(user_id, created_at desc)`, `(ip_hash, created_at desc)`, `(device_hash, created_at desc)`, and `retention_expires_at`.
- Keep using `supabase/functions/_shared/security-request-context.ts` so each function uses identical parsing, normalization, hashing, masking, and failure behavior.

Existing and future event tables should reference:

```sql
alter table public.platform_admin_audit_logs
  add column if not exists security_context_id uuid references public.security_request_context(id);
```

Repeat that reference only on event/audit/security tables that need proof. Do not add raw IP columns to public content/profile/message tables.

## Safe Capture Rules

- Client never supplies trusted IP.
- Backend captures request IP only from trusted request context/headers after infrastructure confirmation.
- Normalize IPv4/IPv6 before hashing or masking.
- Store `ip_hash` for correlation and `ip_prefix_or_masked_ip` for UI. Do not show full raw IP by default.
- Store approximate country/region/city/ASN only when a trusted backend enrichment source exists and legal/privacy review approves it.
- High-risk actions fail closed if policy requires security context and context capture fails.
- Low-risk read-only actions may proceed with `security_context_id = null` and an explicit `context_unavailable` audit metadata flag if product policy allows.
- Service-role secrets, hash peppers, provider secrets, and raw IP values must never enter React Native, docs, logs, screenshots, or committed artifacts.

## Event Attachment Rules

Attach `security_context_id` to these backed/future events as they are implemented:

- `platform_admin_audit_logs`
- `security_audit_events`
- `owner_trusted_devices` current/trusted/revoked records
- failed access/security denial events
- temporary grant create/revoke/bulk-revoke events
- role grant/revoke and scoped permission update audit
- live ops events and operator-approved remediation attempts
- live cost guard admin actions
- LiveKit token request/denial events
- live room creation/join/speaker approval/high-risk state events
- upload-url, publish, unpublish, delete, private media access, and takedown audit events
- safety report intake and admin report actions
- DMCA notice/counter-notice intake and Admin DMCA actions
- comment/reply/chat abuse report events
- payout/provider/fraud/revenue/premium override/admin money-control events
- kill switch, emergency lock, break-glass, and owner security actions

Do not attach raw IP to public profile, public channel, `videos`, comments, chat messages, room messages, or room membership rows unless a later legal/security design explicitly reclassifies those rows as restricted evidence tables.

## UI Rules

Owner Security:

- Show masked IP/network proof only.
- Show approximate region/city and ASN/ISP only when backed.
- Show risk state such as `Normal`, `New Network`, `Suspicious`, or `Unavailable`.
- Never show raw full IP by default.
- Keep emergency actions locked unless owner truth, trusted device, policy approval, reason, confirmation, and audit write all pass.

Audit tab:

- Keep high-level counts/status only.
- Do not show raw IP.
- If security context linkage is unavailable, label it explicitly instead of showing healthy/connected copy.

Audit Explorer:

- Allow quick filtering for rows with or without linked security context.
- Show masked network proof for authorized owner/admin/operator only.
- Keep raw technical metadata collapsed and never expose raw IP by default.

Fraud:

- Use `ip_hash`, device hash, session hash, and context aggregation for patterns.
- Show aggregate/pattern/risk summaries, not raw public display.

Public UI:

- No IP/network proof display.
- No client-provided IP payload fields.

## Retention Rules

Retention durations require product/legal approval before implementation. The recommended categories are:

| Data category | Suggested posture |
| --- | --- |
| Raw/restricted IP | Avoid in v1. If required, short retention, encrypted or service-role restricted, owner/security access only through audited backend paths. |
| Hashed IP/security context | Longer security/fraud retention for correlation, subject to retention expiry and legal review. |
| Immutable audit event | Long retention with masked/hash reference; do not duplicate raw IP in audit rows. |
| Public content tables | No raw IP and no masked IP. Link abuse/security proof through restricted event tables only. |

Add a retention cleanup job only after legal approves exact durations and preservation exceptions for legal holds, fraud, abuse, payouts, disputes, DMCA, and law-enforcement requests.

## Privacy And Legal Documentation Rules

Public/legal copy should say, after legal review, that Chi'llywood may collect IP/network and request metadata for:

- security and account protection
- fraud prevention
- abuse prevention and moderation
- live cost protection
- audit integrity
- payout/revenue/provider integrity
- legal compliance and dispute handling

The docs should also state:

- Raw IP access is restricted.
- Public UI never exposes IP/network proof.
- Retention is limited and purpose-bound.
- Access follows least privilege.
- Some records may be preserved for legal, safety, fraud, billing, payout, moderation, DMCA, or dispute reasons.

Do not publish exact raw-IP retention durations until legal/product owners approve them.

## Implementation Phases

1. Foundation migration:
   - Add `security_request_context`.
   - Enable RLS and deny anon/normal user reads.
   - Add safe owner/admin RPCs that return masked fields only.
   - Add nullable `security_context_id` to `platform_admin_audit_logs`, `security_audit_events`, `owner_trusted_devices`, role/permission audit, report audit, DMCA audit/cases where appropriate, media access audit, Live Ops audit, LiveKit token event table, and payout/fraud audit tables.

2. Shared Edge helper:
   - Add one request-context capture helper.
   - Confirm trusted header precedence.
   - Hash/mask IP with backend-only secret.
   - Hash user agent.
   - Return explicit unavailable states.

3. Owner/admin high-risk actions:
   - Wire Owner Security, role/permission mutations, temporary grants, break-glass, kill switches, Admin config saves, payout/fraud preflights, Live Ops actions, and private media access.
   - Fail closed where policy marks context mandatory.
   - Write immutable audit with `security_context_id`.

4. Live/room/upload/report intake:
   - Add LiveKit token request/denial audit with context.
   - Add report intake context.
   - Add upload-url/publish/delete context.
   - Keep room/message/content rows free of raw IP.

5. UI readouts:
   - Owner Security current device/network proof. Implemented for current/trusted device rows through `admin-owner-controls` safe summary enrichment.
   - Audit Explorer masked security context details. Implemented for protected `audit_list` rows with linked `security_context_id`, including LiveKit token request audit rows.
   - Fraud aggregate network/device pattern surfaces.
   - No raw IP in Audit overview or public UI.

6. Retention/proof:
   - Add retention cleanup only after approved durations.
   - Add denial proofs, public UI grep proofs, no-client-IP payload proofs, and high-risk fail-closed tests.

## Validation Expectations For The Implementation Lane

Run:

- `npm run typecheck`
- `npm run validate:runtime`
- `npm run guard:admin-auth-safety`
- `npm run guard:owner-security-center`
- `npm run guard:refresh-policy`
- `npm run guard:watch-party-livekit`
- `npm run guard:old-room-handling`
- `git diff --check`

Add proof:

- Grep that raw IP is not displayed in public UI.
- Grep that the mobile client does not submit trusted IP fields.
- Non-owner/non-admin cannot read `security_request_context`.
- High-risk actions fail closed when security context capture is required but unavailable.
- Owner/Admin UI shows masked context only.
- Audit Explorer does not expose raw IP.
- LiveKit token behavior and room routes are unchanged except for audited context linkage.

## Closeout Proof Run

The May 23, 2026 masked-readout closeout ran these repo and backend checks:

- `npm run validate:runtime`
- `npm run typecheck`
- `npm run guard:admin-auth-safety`
- `npm run guard:owner-security-center`
- `npm run guard:refresh-policy`
- `npm run guard:payment-rail-policy`
- `npm run guard:security-request-context`
- `npm run guard:security-context-proxy-proof`
- `npm run guard:watch-party-livekit`
- `npm run guard:old-room-handling`
- `deno check supabase/functions/admin-owner-controls/index.ts`
- `supabase db push --dry-run`
- `supabase db lint --linked`
- `git diff --check`

Proof outcomes:

- `admin-owner-controls` is deployed as ACTIVE version `26`; `livekit-token` remains ACTIVE version `63`.
- The linked project has `SECURITY_CONTEXT_HASH_PEPPER` and `SECURITY_CONTEXT_USE_DEFAULT_TRUSTED_IP_HEADERS` configured. `SECURITY_CONTEXT_TRUSTED_IP_HEADERS` is not configured.
- Anon direct reads against `security_request_context` returned `42501`; anon summary RPC returned `security_context_admin_required`.
- A spoofed client-header probe using `x-forwarded-for`, `x-real-ip`, and `cf-connecting-ip` against `livekit-token` returned `403` before token handling; this does not prove a trusted real-IP source, so real IP capture remains disabled.
- Grep proof found no mobile/client trusted-IP submission markers and no public raw-IP/network display. The only client-side IP-hash marker is the protected admin helper type field, which the Admin UI guard prevents from rendering.
- No Watch-Party Live route, Live Watch-Party route, LiveKit token behavior, Premium gate, payout/live-money behavior, public profile/channel behavior, upload behavior, comments, or chat behavior was changed in this closeout.

## Known Limitations After First Backend Slice

- Real IP capture remains unavailable until server-side `SECURITY_CONTEXT_TRUSTED_IP_HEADERS` is configured and proved against the actual proxy/header chain. `SECURITY_CONTEXT_HASH_PEPPER` is configured and default trusted headers are explicitly disabled.
- Existing legacy `platform_admin_audit_logs.ip_hash` / `user_agent_hash` and DMCA submitted hash fields are not backfilled and remain secondary to `security_context_id`.
- DMCA submitted hash fields exist but need backend-only trusted capture.
- Reports, uploads, comments, chat abuse, payout, fraud, Live Ops, DMCA intake, and SQL-only role/permission RPC actions do not yet share a security context id.
- Owner Security and Audit Explorer render masked network proof for linked rows.
- Authorized owner/admin masked summary read proof remains pending because the only local credential available in this shell is non-staff/non-owner and correctly cannot read `livekit_token_request_audit` or security context summaries. Non-staff proof returned `42501` for direct context table reads and `security_context_admin_required` for summary RPC reads.
- Staff-but-not-owner failed owner-security denial proof remains a prior Owner Security follow-up if a safe scoped proof account is available.
