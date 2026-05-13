import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SITE_HOST = "https://chillywoodstream.com";
const SUPPORT_EMAIL = "support@chillywoodstream.com";
const LAST_UPDATED = "May 13, 2026";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..", "..");
const siteRoot = path.join(scriptDir, "site");

const pages = [
  {
    slug: "terms",
    title: "Terms of Service",
    source: "docs/legal/TERMS_OF_SERVICE.md",
    description: "The account, creator, streaming, Premium, safety, and support rules for Chi'llywood.",
  },
  {
    slug: "privacy",
    title: "Privacy Policy",
    source: "docs/legal/PRIVACY_POLICY.md",
    description: "How Chi'llywood handles account, profile, channel, upload, room, support, billing, diagnostics, and safety data.",
  },
  {
    slug: "creator-rules",
    title: "Creator Rules",
    source: "docs/legal/CREATOR_RULES.md",
    description: "Ownership, upload, Channel, live, monetization, sponsor, and enforcement rules for creators.",
  },
  {
    slug: "community-guidelines",
    title: "Community Guidelines",
    source: "docs/legal/COMMUNITY_GUIDELINES.md",
    description: "The content, conduct, live-room, chat, reporting, and enforcement rules for Chi'llywood.",
  },
  {
    slug: "copyright",
    title: "Copyright And DMCA Policy",
    source: "docs/legal/COPYRIGHT_DMCA_POLICY.md",
    description: "How Chi'llywood handles copyright complaints, takedowns, counter-notices, and repeat infringement.",
  },
  {
    slug: "account-deletion",
    title: "Account Deletion",
    source: "docs/legal/ACCOUNT_DELETION_POLICY.md",
    description: "How to request account deletion, what deletion may affect, and what may be retained.",
  },
  {
    slug: "refunds",
    title: "Refunds And Subscriptions",
    source: "docs/legal/REFUNDS_SUBSCRIPTIONS_POLICY.md",
    description: "How Premium subscription charges, cancellations, refunds, trials, and access changes are handled.",
  },
  {
    slug: "sponsor-disclosure",
    title: "Sponsor And Paid Promotion Disclosure",
    source: "docs/legal/SPONSOR_DISCLOSURE_POLICY.md",
    description: "Disclosure rules for paid, gifted, affiliate, discounted, or otherwise compensated promotions.",
  },
  {
    slug: "banned-content",
    title: "Banned Content",
    source: "docs/legal/BANNED_CONTENT_POLICY.md",
    description: "Content and behavior Chi'llywood does not allow.",
  },
  {
    slug: "moderation",
    title: "Moderation And Reporting",
    source: "docs/legal/MODERATION_REPORTING_WORKFLOW.md",
    description: "How Chi'llywood takes in reports, prioritizes safety issues, reviews content, and records actions.",
  },
  {
    slug: "support",
    title: "Support",
    description: "How to contact Chi'llywood Support for account, policy, copyright, abuse, subscription, and product help.",
    markdown: buildSupportMarkdown(),
  },
];

const navLinks = pages.map(({ slug, title }) => ({ slug, title }));

function buildSupportMarkdown() {
  return `# Support

Last updated: ${LAST_UPDATED}

Chi'llywood Support can help with account access, Profile or Channel issues, account deletion requests, legal/policy questions, copyright concerns, report-abuse guidance, subscription troubleshooting, and product reliability problems.

Support contact: ${SUPPORT_EMAIL}

## Account Deletion

To request account deletion, review the Account Deletion page and contact Chi'llywood Support from the account you want reviewed when possible.

- Account deletion page: ${SITE_HOST}/account-deletion
- Support email: ${SUPPORT_EMAIL}

Account deletion is request-based in current repo truth. Chi'llywood may need to verify account ownership before processing a request.

## Copyright And Media Rights

For copyright complaints, unauthorized uploads, takedown questions, or counter-notice questions, review the Copyright And DMCA Policy and contact Support with enough information to locate the content.

- Copyright policy: ${SITE_HOST}/copyright
- Support email: ${SUPPORT_EMAIL}

The official DMCA designated-agent setup is pending. Chi'llywood does not claim DMCA safe-harbor completion or Copyright Office designated-agent registration from this support page.

## Report Abuse Or Unsafe Content

Use in-app report tools where available for content tied to a video, Profile, Channel, chat, Watch-Party room, Live Stage, comment, or message. You can also contact Support for harassment, impersonation, hate, threats, doxxing, scams, malware, minor-safety concerns, privacy concerns, or other unsafe behavior.

Chi'llywood Support is not an emergency service. If there is immediate danger, contact local emergency services or the appropriate authority first.

## Subscriptions And Refunds

For Premium subscriptions purchased through an app store or store provider, the store normally controls renewals, cancellations, and refunds. Chi'llywood cannot promise a refund outside applicable law and the policy of the store or provider that processed the purchase.

- Refunds and subscriptions: ${SITE_HOST}/refunds

## Other Policy Pages

- Terms of Service: ${SITE_HOST}/terms
- Privacy Policy: ${SITE_HOST}/privacy
- Community Guidelines: ${SITE_HOST}/community-guidelines
- Creator Rules: ${SITE_HOST}/creator-rules
- Sponsor Disclosure Policy: ${SITE_HOST}/sponsor-disclosure
- Banned Content Policy: ${SITE_HOST}/banned-content
- Moderation And Reporting: ${SITE_HOST}/moderation

## Response Expectations

Response timing depends on issue type, safety priority, copyright review, account verification, and support capacity. Severe safety, child-safety, threat, illegal-content, account-compromise, and active scam reports may be prioritized.`;
}

function readPageMarkdown(page) {
  if (page.markdown) return page.markdown;
  return fs.readFileSync(path.join(repoRoot, page.source), "utf8");
}

function publicizeMarkdown(markdown, slug) {
  let text = markdown.replace(/\r\n/g, "\n");

  text = text
    .split("\n")
    .filter((line) => !line.startsWith("> Repo launch note:"))
    .filter((line) => !line.match(/^Last updated:/i))
    .join("\n");

  text = text.replace(
    /## 2\. Copyright Complaints[\s\S]*?## 3\. Required Complaint Information/,
    `## 2. Copyright Complaints

If you believe content on Chi'llywood infringes your copyright, send a copyright complaint to Chi'llywood Support at ${SUPPORT_EMAIL} with enough information for review.

Chi'llywood's official designated DMCA agent setup is pending. This page does not claim DMCA safe-harbor completion or U.S. Copyright Office designated-agent registration.

## 3. Required Complaint Information`,
  );

  text = text.replace(
    /## Launch Status[\s\S]*$/m,
    `## Current Provider Status

Premium billing, cancellation, restore, and refund behavior depends on the Google Play, Apple, RevenueCat, or other provider setup that is actually active for a release. Chi'llywood does not promise refunds beyond applicable law and the policy of the store or provider that processed the purchase.`,
  );

  text = text.replace(
    /## Launch Blockers[\s\S]*?Support: support@chillywoodstream\.com/m,
    `## Google Play And Web-Link Status

This public account deletion page can be used as the web deletion information page once it is deployed at the final public URL. Google Play account deletion compliance must not be treated as complete until the final public URL is reachable without login, entered in Play Console, and accepted by Google Play.

Backend deletion/de-identification rules, support ownership, and deletion timing still depend on the approved operational runbook.

Support: ${SUPPORT_EMAIL}`,
  );

  text = text
    .replace(/\[ATTORNEY[^\]\n]*\]\n?/g, "")
    .replace(/\[LEGAL \/ SUPPORT \/ BACKEND OWNER[^\]\n]*\]\n?/g, "")
    .replace(/\[PUBLIC_ACCOUNT_DELETION_URL\]/g, `${SITE_HOST}/account-deletion`)
    .replace(/\[PUBLIC_TERMS_URL\]/g, `${SITE_HOST}/terms`)
    .replace(/\[PUBLIC_PRIVACY_URL\]/g, `${SITE_HOST}/privacy`)
    .replace(/^- DMCA agent name: \[DMCA AGENT NAME\]\n?/gm, "")
    .replace(/^- DMCA email: \[DMCA_EMAIL\]\n?/gm, "")
    .replace(/^- Mailing address: \[DMCA MAILING ADDRESS\]\n?/gm, "")
    .replace(/^- Phone, if used: \[DMCA PHONE IF USED\]\n?/gm, "")
    .replace(/^Legal contact: \[LEGAL_EMAIL\]\n?/gm, "")
    .replace(/^Privacy\/legal contact: \[LEGAL_EMAIL\]\n?/gm, "")
    .replace(/^Public Terms URL: .*\n?/gm, "")
    .replace(/^Public Privacy URL: .*\n?/gm, "")
    .replace(/- Final public URL placeholder: .*\n?/gm, "")
    .replace(/unless replaced by .*/g, "unless replaced by a later approved public URL.");

  if (slug === "account-deletion") {
    text = text.replace(
      "- `https://live.chillywoodstream.com/account-deletion`",
      `- ${SITE_HOST}/account-deletion`,
    );
  }

  return text.replace(/\n{3,}/g, "\n\n").trim();
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function inlineMarkdown(value) {
  let html = escapeHtml(value);

  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  html = html.replace(
    new RegExp(SUPPORT_EMAIL.replace(".", "\\."), "g"),
    `<a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a>`,
  );
  html = html.replace(
    /https:\/\/chillywoodstream\.com\/([a-z-]+)/g,
    (_match, slug) => `<a href="/${slug}">${SITE_HOST}/${slug}</a>`,
  );
  html = html.replace(
    /https:\/\/live\.chillywoodstream\.com\/([a-z-]+)/g,
    (_match, slug) => `<a href="https://live.chillywoodstream.com/${slug}">https://live.chillywoodstream.com/${slug}</a>`,
  );
  return html;
}

function closeLists(state, output) {
  if (state.list === "ul") output.push("</ul>");
  if (state.list === "ol") output.push("</ol>");
  state.list = null;
}

function markdownToHtml(markdown) {
  const lines = markdown.split("\n");
  const output = [];
  const state = { list: null };

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line) {
      closeLists(state, output);
      continue;
    }

    if (line.startsWith("# ")) {
      closeLists(state, output);
      continue;
    }

    const heading = line.match(/^(#{2,4})\s+(.+)$/);
    if (heading) {
      closeLists(state, output);
      const level = Math.min(heading[1].length, 3);
      const text = heading[2].replace(/\s+#$/, "");
      output.push(`<h${level} id="${slugify(text)}">${inlineMarkdown(text)}</h${level}>`);
      continue;
    }

    const bullet = line.match(/^-\s+(.+)$/);
    if (bullet) {
      if (state.list !== "ul") {
        closeLists(state, output);
        output.push("<ul>");
        state.list = "ul";
      }
      output.push(`<li>${inlineMarkdown(bullet[1])}</li>`);
      continue;
    }

    const ordered = line.match(/^\d+\.\s+(.+)$/);
    if (ordered) {
      if (state.list !== "ol") {
        closeLists(state, output);
        output.push("<ol>");
        state.list = "ol";
      }
      output.push(`<li>${inlineMarkdown(ordered[1])}</li>`);
      continue;
    }

    closeLists(state, output);
    output.push(`<p>${inlineMarkdown(line)}</p>`);
  }

  closeLists(state, output);
  return output.join("\n");
}

function renderNav(currentSlug) {
  return navLinks
    .map(({ slug, title }) => {
      const current = slug === currentSlug ? ' aria-current="page"' : "";
      return `<a${current} href="/${slug}">${escapeHtml(title)}</a>`;
    })
    .join("\n");
}

function renderPage(page, html) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(page.title)} | Chi'llywood</title>
  <meta name="description" content="${escapeHtml(page.description)}">
  <link rel="stylesheet" href="/assets/styles.css">
</head>
<body>
  <header class="site-header">
    <div class="site-header-inner">
      <a class="brand" href="/">Chi'llywood</a>
      <nav class="site-nav" aria-label="Public legal pages">
${renderNav(page.slug)}
      </nav>
    </div>
  </header>
  <main class="page-shell">
    <article class="policy">
      <p class="eyebrow">Chi'llywood Public Policy</p>
      <h1>${escapeHtml(page.title)}</h1>
      <p class="summary">${escapeHtml(page.description)}</p>
      <p class="updated">Last updated: ${LAST_UPDATED}</p>
      <div class="policy-body">
${html}
      </div>
    </article>
    <aside class="related" aria-label="Related policy links">
      <h2>Legal Pages</h2>
      <div class="related-links">
${renderNav(page.slug)}
      </div>
      <p>Questions? Contact <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a>.</p>
    </aside>
  </main>
  <footer class="site-footer">
    <p>Chi'llywood public legal and support pages. For account, copyright, safety, or subscription help, contact <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a>.</p>
  </footer>
</body>
</html>
`;
}

function renderIndex() {
  const links = navLinks
    .map(({ slug, title }) => `<li><a href="/${slug}">${escapeHtml(title)}</a></li>`)
    .join("\n");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Chi'llywood Public Policies</title>
  <meta name="description" content="Public legal, support, account deletion, copyright, creator, and safety pages for Chi'llywood.">
  <link rel="stylesheet" href="/assets/styles.css">
</head>
<body>
  <header class="site-header">
    <div class="site-header-inner">
      <a class="brand" href="/">Chi'llywood</a>
      <nav class="site-nav" aria-label="Public legal pages">
${renderNav("")}
      </nav>
    </div>
  </header>
  <main class="page-shell">
    <article class="policy">
      <p class="eyebrow">Chi'llywood Public Policies</p>
      <h1>Public Legal And Support Pages</h1>
      <p class="summary">Use these pages for Chi'llywood's public Terms, Privacy Policy, Creator Rules, Community Guidelines, Copyright policy, Account Deletion information, Refund and Subscription terms, Sponsor Disclosure rules, Banned Content policy, Moderation workflow, and Support contact.</p>
      <p class="updated">Last updated: ${LAST_UPDATED}</p>
      <div class="policy-body">
        <ul>
${links}
        </ul>
        <p>Support contact: <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a>.</p>
      </div>
    </article>
  </main>
  <footer class="site-footer">
    <p>Chi'llywood public legal and support pages.</p>
  </footer>
</body>
</html>
`;
}

function writeFile(filePath, contents) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents);
}

function assertPublicOutput(contents, filePath) {
  const forbidden = [
    /\[ATTORNEY/i,
    /\[LEGAL/i,
    /\[PUBLIC_/i,
    /\[DMCA/i,
    /Attorney review required/i,
    /legal@chillywoodstream\.com/i,
    /dmca@chillywoodstream\.com/i,
    /privacy@chillywoodstream\.com/i,
    /copyright@chillywoodstream\.com/i,
  ];

  const match = forbidden.find((pattern) => pattern.test(contents));
  if (match) {
    throw new Error(`public output failed placeholder/contact check for ${filePath}: ${match}`);
  }
}

function writeStyles() {
  writeFile(
    path.join(siteRoot, "assets", "styles.css"),
    `:root {
  color-scheme: light;
  --ink: #17181c;
  --muted: #5c6370;
  --surface: #ffffff;
  --page: #f5f6f3;
  --line: #dfe3df;
  --accent: #b4172a;
  --accent-2: #0f766e;
  --header: #101217;
  --header-muted: #c8ced8;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  background: var(--page);
  color: var(--ink);
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  line-height: 1.6;
}

a {
  color: var(--accent);
  text-underline-offset: 0.18em;
}

.site-header {
  background: var(--header);
  color: #fff;
  border-bottom: 4px solid var(--accent);
}

.site-header-inner {
  max-width: 1120px;
  margin: 0 auto;
  padding: 18px 20px 16px;
}

.brand {
  display: inline-block;
  color: #fff;
  font-size: 1.35rem;
  font-weight: 800;
  text-decoration: none;
  margin-bottom: 14px;
}

.site-nav,
.related-links {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.site-nav a,
.related-links a {
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 6px;
  color: var(--header-muted);
  font-size: 0.82rem;
  font-weight: 700;
  line-height: 1.2;
  padding: 8px 10px;
  text-decoration: none;
}

.site-nav a:hover,
.site-nav a[aria-current="page"],
.related-links a:hover,
.related-links a[aria-current="page"] {
  background: #fff;
  color: var(--header);
}

.page-shell {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 280px;
  gap: 28px;
  max-width: 1120px;
  margin: 0 auto;
  padding: 36px 20px;
}

.policy,
.related {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 8px;
  box-shadow: 0 12px 34px rgba(15, 18, 23, 0.06);
}

.policy {
  padding: 34px;
}

.related {
  align-self: start;
  padding: 20px;
  position: sticky;
  top: 18px;
}

.eyebrow {
  color: var(--accent-2);
  font-size: 0.78rem;
  font-weight: 900;
  letter-spacing: 0;
  margin: 0 0 8px;
  text-transform: uppercase;
}

h1 {
  font-size: clamp(2rem, 4vw, 3.1rem);
  line-height: 1.05;
  letter-spacing: 0;
  margin: 0;
}

.summary {
  color: var(--muted);
  font-size: 1.04rem;
  margin: 16px 0 0;
  max-width: 760px;
}

.updated {
  border-top: 1px solid var(--line);
  color: var(--muted);
  font-size: 0.92rem;
  margin: 22px 0 0;
  padding-top: 16px;
}

.policy-body {
  margin-top: 28px;
}

.policy-body h2 {
  border-top: 1px solid var(--line);
  font-size: 1.42rem;
  line-height: 1.25;
  margin: 30px 0 10px;
  padding-top: 24px;
}

.policy-body h3 {
  font-size: 1.1rem;
  line-height: 1.35;
  margin: 24px 0 8px;
}

.policy-body p {
  margin: 0 0 14px;
}

.policy-body ul,
.policy-body ol {
  margin: 0 0 18px;
  padding-left: 1.35rem;
}

.policy-body li {
  margin: 7px 0;
}

code {
  background: #eef1ee;
  border: 1px solid var(--line);
  border-radius: 4px;
  font-size: 0.92em;
  padding: 0.08rem 0.28rem;
}

.related h2 {
  font-size: 1rem;
  margin: 0 0 12px;
}

.related .related-links {
  display: grid;
}

.related .related-links a {
  border-color: var(--line);
  color: var(--ink);
}

.related p {
  color: var(--muted);
  font-size: 0.9rem;
  margin: 18px 0 0;
}

.site-footer {
  border-top: 1px solid var(--line);
  color: var(--muted);
  font-size: 0.9rem;
  margin: 0 auto;
  max-width: 1120px;
  padding: 24px 20px 42px;
}

@media (max-width: 860px) {
  .page-shell {
    display: block;
    padding: 24px 14px;
  }

  .policy {
    padding: 24px 18px;
  }

  .related {
    margin-top: 18px;
    position: static;
  }

  .site-header-inner {
    padding: 16px 14px 14px;
  }

  .site-nav a {
    flex: 1 1 auto;
    text-align: center;
  }
}
`,
  );
}

fs.rmSync(siteRoot, { recursive: true, force: true });
writeStyles();
writeFile(path.join(siteRoot, "index.html"), renderIndex());

for (const page of pages) {
  const publicMarkdown = publicizeMarkdown(readPageMarkdown(page), page.slug);
  const html = renderPage(page, markdownToHtml(publicMarkdown));
  const outFile = path.join(siteRoot, page.slug, "index.html");
  assertPublicOutput(html, outFile);
  writeFile(outFile, html);
}

console.log(`public legal site built at ${siteRoot}`);
