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

Current repo truth: this static site can be built and proved locally from repo source. Deployment to `chillywoodstream.com`, DNS/hosting routing, Google Play web-link acceptance, attorney review, DMCA designated-agent public posting, and Copyright Office registration remain external until separately proved.

Cloudflare status as of May 13, 2026:

- Pages project: `chillywood-legal`
- Proved Pages hostname: `https://chillywood-legal.pages.dev`
- Required paths returned HTTP 200 on the Pages hostname.
- Custom domain `chillywoodstream.com` is attached to the Pages project but remains pending.
- Public DNS for the apex does not resolve yet; the current Wrangler OAuth session cannot create DNS records because Cloudflare DNS Records API access returns `403`.
