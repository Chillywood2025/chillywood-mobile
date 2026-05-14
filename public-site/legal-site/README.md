# Chi'llywood Public Legal Site

This folder owns the static public legal/support URL surface for launch readiness.

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
- `https://chillywoodstream.com/refunds`
- `https://chillywoodstream.com/sponsor-disclosure`
- `https://chillywoodstream.com/banned-content`
- `https://chillywoodstream.com/moderation`
- `https://chillywoodstream.com/support`

Current repo truth: this static site is deployed on `chillywoodstream.com` from repo source. Google Play web-link acceptance, attorney review, support inbox receipt proof, uploader-facing counter-notice submission if required, and outbound email automation remain external/pending until separately proved. DMCA designated-agent public contact posting and U.S. Copyright Office registration are recorded complete for registration `DMCA-1072720`; backed/Admin DMCA case tooling is live-proof closed in the app/backend.

Cloudflare status as of May 13, 2026:

- Pages project: `chillywood-legal`
- Proved Pages hostname: `https://chillywood-legal.pages.dev`
- Required paths returned HTTP 200 on the Pages hostname.
- Custom domain `chillywoodstream.com` is active.
- `https://chillywoodstream.com/` returns HTTP/2 200.
- `/terms`, `/privacy`, `/account-deletion`, `/copyright`, and `/support` return HTTP/2 200 after trailing-slash redirect.
- No LiveKit fallback was reached on legal/support paths.
