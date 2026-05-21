# Chi'llywood Public Legal Site

This folder owns the static public legal/support URL surface for launch readiness.

Canonical policy text now comes from `../../legal/policies.mjs`. The older markdown drafts in `docs/legal/` remain historical/supporting docs, but the mobile app, public static site, and Admin Canary legal readiness checks all use the shared policy module.

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
- `https://chillywoodstream.com/account-deletion`
- `https://chillywoodstream.com/support`
- `https://chillywoodstream.com/premium-terms`
- `https://chillywoodstream.com/live-rules`
- `https://chillywoodstream.com/law-enforcement`
- `https://chillywoodstream.com/moderation-policy`
- `https://chillywoodstream.com/creator-monetization`

Current repo truth: this static site is deployed on `chillywoodstream.com` from repo source. The May 21, 2026 deployment uploaded the expanded generated output to Cloudflare Pages project `chillywood-legal`; sampled apex proof returned HTTP 200 after redirect for `/privacy/`, `/creator-monetization/`, and `/live-rules/`, and earlier apex proof remains the governing baseline for `/terms`, `/account-deletion`, `/copyright`, and `/support` unless a later deployment regresses them. Support inbox receipt proof for `support@chillywoodstream.com` is closed, and public DNS proves Cloudflare MX, SPF `v=spf1 include:_spf.mx.cloudflare.net ~all`, and DMARC `v=DMARC1; p=none; rua=mailto:support@chillywoodstream.com; adkim=r; aspf=r; fo=1`. DKIM remains pending until a real outbound mail provider for `@chillywoodstream.com` issues selector records. Google Play web-link acceptance, attorney review, uploader-facing counter-notice submission if required, and outbound email automation remain external/pending until separately proved. DMCA designated-agent public contact posting and U.S. Copyright Office registration are recorded complete for registration `DMCA-1072720`; backed/Admin DMCA case tooling is live-proof closed in the app/backend.

The May 21 policy bundle includes 12 full pages, each over 1,500 words: Privacy, Terms, Community Guidelines, Creator Rules, Copyright/DMCA, Support & Account Help, Account Deletion, Premium/Subscription Terms, Live/Watch-Party/Chat Rules, Law Enforcement/Legal Requests, Moderation/Appeals, and Creator Monetization/Revenue Disclaimer. `npm run legal-site:build` currently generates 17 static pages: the 12 policy pages plus compatibility aliases for existing launch/legal paths.

Cloudflare status as of May 21, 2026:

- Pages project: `chillywood-legal`
- Proved Pages hostname: `https://chillywood-legal.pages.dev`
- Expanded generated output deployed successfully from `public-site/legal-site/site/`.
- Custom domain `chillywoodstream.com` is active.
- `https://chillywoodstream.com/` returns HTTP/2 200.
- `/privacy`, `/creator-monetization`, and `/live-rules` returned HTTP 200 after trailing-slash redirect in May 21 proof.
- `/terms`, `/account-deletion`, `/copyright`, and `/support` had prior HTTP 200 proof after trailing-slash redirect and remain current unless a later deploy regresses them.
- No LiveKit fallback was reached on legal/support paths.
- Admin Canary legal readiness passed in the May 21 production run with `33 pass`, `0 manual`, and `0 failed` across the full canary set.
