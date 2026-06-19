# Brand Spelling Policy

The visible product brand is:

`Chi'llywood`

Use this spelling in user-facing app copy, normal product docs, QA docs, BrowserStack docs, legal docs, public-site content, email templates, README/status docs, and AI guidance.

Wrong spelling examples are documented only here and in `scripts/guard-brand-spelling-policy.mjs` so the guard can prevent regressions:

- `Chi'llwood`
- `Chi’llwood`
- `Chillywood`
- `Chillwood`

Lowercase technical identifiers such as `com.chillywood.mobile`, `chillywoodstream.com`, package names, branch names, local proof folder names, and database object identifiers may keep their existing identifier spelling when changing them would break integrations or historical proof references. Those identifiers must not be used as visible brand copy.
