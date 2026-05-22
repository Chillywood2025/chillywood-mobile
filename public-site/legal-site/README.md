# Chi'llywood Public Legal Site

This folder owns the static public legal/support URL surface for launch readiness.

Canonical policy text now comes from `../../legal/policies.mjs`. The older markdown drafts in `docs/legal/` remain historical/supporting docs, but the mobile app, public static site, and Admin Canary legal readiness checks all use the shared policy module.

Public legal/support UI and intake forms inherit `../../docs/APP_UI_UX_RULES.md`: production forms, mobile-first spacing, real submit/loading/success/error states, honest disabled reasons, no admin-only exposure, no raw debug UI, and no fake proof.

Build:

```sh
npm run legal-site:build
```

Serve locally:

```sh
npm run legal-site:serve -- --port 4177
```

Deployable output:

```text
public-site/legal-site/site/
```

Preferred production mapping after DNS/hosting setup:

- `https://chillywoodstream.com/terms`
- `https://chillywoodstream.com/privacy`
- `https://chillywoodstream.com/creator-rules`
- `https://chillywoodstream.com/community-guidelines`
- `https://chillywoodstream.com/copyright`
- `https://chillywoodstream.com/copyright-report`
- `https://chillywoodstream.com/account-deletion`
- `https://chillywoodstream.com/support`
- `https://chillywoodstream.com/premium-terms`
- `https://chillywoodstream.com/live-rules`
- `https://chillywoodstream.com/law-enforcement`
- `https://chillywoodstream.com/moderation-policy`
- `https://chillywoodstream.com/creator-monetization`

Current repo truth: this static site is deployed on `chillywoodstream.com` from repo source. The May 22, 2026 deployment uploaded the expanded generated output to Cloudflare Pages project `chillywood-legal`; apex proof returned HTTP 200 after redirect for `/copyright-report/`, and prior May 21 apex proof remains the governing baseline for `/privacy/`, `/creator-monetization/`, `/live-rules/`, `/terms`, `/account-deletion`, `/copyright`, and `/support` unless a later deployment regresses them. Support inbox receipt proof for `support@chillywoodstream.com` is closed, and public DNS proves Cloudflare MX, SPF `v=spf1 include:_spf.mx.cloudflare.net ~all`, and DMARC `v=DMARC1; p=none; rua=mailto:support@chillywoodstream.com; adkim=r; aspf=r; fo=1`. DKIM remains pending until a real outbound mail provider for `@chillywoodstream.com` issues selector records. Google Play web-link acceptance, attorney review, outbound email automation, and automated malware scanning remain external/pending until separately proved. DMCA designated-agent public contact posting and U.S. Copyright Office registration are recorded complete for registration `DMCA-1072720`; backed/Admin DMCA case management is production-closeout complete in the app/backend, including formal notice intake, public form intake, private evidence attachments with pending-manual-review scan status, uploader-facing counter-notice self-service for the affected uploader, case detail, content actions, strikes, counter-notice recording, functional case history, scoped RLS/RPC access, and production-hidden test/proof cases. Owner/Admin Legal Intake and Legal Evidence are also production-closeout complete in the app/backend: one top-level Legal tab contains Intake/Evidence/Holds/Requests/Exports/Timeline sections, legal request list/create/open/status/timeline/evidence linkage is backed, scoped Admin preview/export/hold access is enforced server-side, and owner normal Legal work does not require a reason prompt or owner-sensitive app-level audit unless Break Glass is active.

The May 21 policy bundle includes 12 full pages, each over 1,500 words: Privacy, Terms, Community Guidelines, Creator Rules, Copyright/DMCA, Support & Account Help, Account Deletion, Premium/Subscription Terms, Live/Watch-Party/Chat Rules, Law Enforcement/Legal Requests, Moderation/Appeals, and Creator Monetization/Revenue Disclaimer. `npm run legal-site:build` currently generates 18 static pages: the 12 policy pages, the formal `/copyright-report` public intake page, and compatibility aliases for existing launch/legal paths.

Cloudflare status as of May 22, 2026:

- Pages project: `chillywood-legal`
- Proved Pages deployment: `https://0c365932.chillywood-legal.pages.dev`
- Expanded generated output deployed successfully from `public-site/legal-site/site/`.
- Custom domain `chillywoodstream.com` is active.
- `https://chillywoodstream.com/` returns HTTP/2 200.
- `/copyright-report` returned HTTP 200 after trailing-slash redirect in May 22 proof and hosts the public copyright notice form.
- `/privacy`, `/creator-monetization`, and `/live-rules` returned HTTP 200 after trailing-slash redirect in May 21 proof.
- `/terms`, `/account-deletion`, `/copyright`, and `/support` had prior HTTP 200 proof after trailing-slash redirect and remain current unless a later deploy regresses them.
- No LiveKit fallback was reached on legal/support paths.
- Admin Canary legal/DMCA readiness is backed by `admin-owner-controls` ACTIVE version 20 and `admin-legal-evidence` ACTIVE version 7. The May 22 physical Android owner-device release run on `R5CR120QCBF` returned `65 pass`, `0 manual_required`, and `0 failed` after the Legal Intake / Legal Evidence closeout checks were added.
- The public DMCA URL canary now passes through configured `PUBLIC_DMCA_URL=https://chillywoodstream.com/copyright-report`; the public form canary submits through anon `submit_dmca_notice`, uploads private DMCA evidence to `dmca-evidence` with manual scan review status, reads back required fields/attachments as Admin, denies anonymous evidence download, and cleans up test-only proof records.
- The Legal Intake / Legal Evidence canary proves one Legal top-level Admin tab, legal request list/create/open/status/timeline/evidence linkage, scoped Admin preview/export/hold enforcement, ungranted Admin/moderator/viewer denial, owner normal Legal Intake without reason prompt, proof grant cleanup, and Legal Evidence target coverage.
