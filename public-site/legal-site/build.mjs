import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  LEGAL_POLICIES,
  LEGAL_PUBLIC_BASE_URL,
  LEGAL_SUPPORT_EMAIL,
  countPolicyWords,
} from "../../legal/policies.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const siteRoot = path.join(scriptDir, "site");
const lastUpdated = "May 21, 2026";

const policyBySlug = Object.fromEntries(LEGAL_POLICIES.map((policy) => [policy.slug, policy]));
const pages = [
  ...LEGAL_POLICIES.map((policy) => ({
  description: policy.summary,
  lastUpdated: policy.effectiveDate,
  policy,
  slug: policy.slug === "support-help" ? "support" : policy.path.replace(/^\//, ""),
  title: policy.title,
  })),
  {
    description: policyBySlug["premium-terms"].summary,
    lastUpdated: policyBySlug["premium-terms"].effectiveDate,
    policy: policyBySlug["premium-terms"],
    slug: "refunds",
    title: "Refunds and Subscriptions",
  },
  {
    description: policyBySlug["community-guidelines"].summary,
    lastUpdated: policyBySlug["community-guidelines"].effectiveDate,
    policy: policyBySlug["community-guidelines"],
    slug: "banned-content",
    title: "Banned Content and Community Safety",
  },
  {
    description: policyBySlug["moderation-policy"].summary,
    lastUpdated: policyBySlug["moderation-policy"].effectiveDate,
    policy: policyBySlug["moderation-policy"],
    slug: "moderation",
    title: "Moderation and Reporting",
  },
  {
    description: policyBySlug["creator-monetization"].summary,
    lastUpdated: policyBySlug["creator-monetization"].effectiveDate,
    policy: policyBySlug["creator-monetization"],
    slug: "sponsor-disclosure",
    title: "Sponsor and Monetization Disclosure",
  },
];

const navLinks = pages.map(({ slug, title }) => ({ slug, title }));

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function linkify(value) {
  return escapeHtml(value)
    .replace(
      new RegExp(LEGAL_SUPPORT_EMAIL.replace(".", "\\."), "g"),
      `<a href="mailto:${LEGAL_SUPPORT_EMAIL}">${LEGAL_SUPPORT_EMAIL}</a>`,
    )
    .replace(
      /https:\/\/chillywoodstream\.com\/([a-z-]+)/g,
      (_match, slug) => `<a href="/${slug}">${LEGAL_PUBLIC_BASE_URL}/${slug}</a>`,
    );
}

function renderNav(currentSlug) {
  return navLinks
    .map(({ slug, title }) => {
      const current = slug === currentSlug ? ' aria-current="page"' : "";
      return `<a${current} href="/${slug}">${escapeHtml(title)}</a>`;
    })
    .join("\n");
}

function renderPolicyBody(policy) {
  return policy.sections.map((section) => `
        <section class="policy-section" id="${slugify(section.heading)}">
          <h2>${escapeHtml(section.heading)}</h2>
          ${section.paragraphs.map((paragraph) => `<p>${linkify(paragraph)}</p>`).join("\n          ")}
        </section>`).join("\n");
}

function renderPage(page) {
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
      <div class="meta-row">
        <span>Effective: ${escapeHtml(page.policy.effectiveDate)}</span>
        <span>Version: ${escapeHtml(page.policy.version)}</span>
        <span>${countPolicyWords(page.policy).toLocaleString()} words</span>
      </div>
      <nav class="toc" aria-label="Policy sections">
        ${page.policy.sections.map((section) => `<a href="#${slugify(section.heading)}">${escapeHtml(section.heading)}</a>`).join("\n        ")}
      </nav>
      <div class="policy-body">
${renderPolicyBody(page.policy)}
      </div>
    </article>
    <aside class="related" aria-label="Related policy links">
      <h2>Legal Pages</h2>
      <div class="related-links">
${renderNav(page.slug)}
      </div>
      <p>Questions? Contact <a href="mailto:${LEGAL_SUPPORT_EMAIL}">${LEGAL_SUPPORT_EMAIL}</a>.</p>
    </aside>
  </main>
  <footer class="site-footer">
    <p>Chi'llywood public legal and support pages.</p>
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
  <meta name="description" content="Public legal, support, account deletion, copyright, creator, live, Premium, law enforcement, moderation, and safety pages for Chi'llywood.">
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
      <p class="summary">Use these pages for Chi'llywood's public Terms, Privacy Policy, Community Guidelines, Creator Terms, Copyright/DMCA, Support, Account Deletion, Premium, Live/Watch-Party/Chat, Law Enforcement, Moderation/Appeals, and Creator Monetization policies.</p>
      <p class="updated">Last updated: ${lastUpdated}</p>
      <div class="policy-body">
        <ul>
${links}
        </ul>
        <p>Support contact: <a href="mailto:${LEGAL_SUPPORT_EMAIL}">${LEGAL_SUPPORT_EMAIL}</a>.</p>
        <p>Review the full policy page that matches your question, then contact support if you need account-specific help.</p>
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
    /legal@chillywoodstream\.com/i,
    /dmca@chillywoodstream\.com/i,
    /privacy@chillywoodstream\.com/i,
    /copyright@chillywoodstream\.com/i,
  ];

  const match = forbidden.find((pattern) => pattern.test(contents));
  if (match) throw new Error(`public output failed placeholder/contact check for ${filePath}: ${match}`);
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
  --header: #101217;
  --header-muted: #c8ced8;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--page);
  color: var(--ink);
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  line-height: 1.65;
}
a { color: var(--accent); text-underline-offset: 0.18em; }
.site-header { background: var(--header); color: #fff; border-bottom: 4px solid var(--accent); }
.site-header-inner { max-width: 1180px; margin: 0 auto; padding: 18px 20px 16px; }
.brand { display: inline-block; color: #fff; font-size: 1.35rem; font-weight: 900; text-decoration: none; margin-bottom: 14px; }
.site-nav, .related-links, .toc { display: flex; flex-wrap: wrap; gap: 8px; }
.site-nav a, .related-links a, .toc a {
  border: 1px solid rgba(255,255,255,0.16);
  border-radius: 8px;
  color: var(--header-muted);
  font-size: 0.82rem;
  font-weight: 750;
  line-height: 1.2;
  padding: 8px 10px;
  text-decoration: none;
}
.site-nav a:hover, .site-nav a[aria-current="page"], .related-links a:hover, .related-links a[aria-current="page"] {
  background: rgba(180,23,42,0.24);
  color: #fff;
  border-color: rgba(255,255,255,0.34);
}
.page-shell { display: grid; grid-template-columns: minmax(0, 1fr) 280px; gap: 24px; max-width: 1180px; margin: 0 auto; padding: 28px 20px 42px; }
.policy, .related {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 18px;
  box-shadow: 0 14px 34px rgba(16,18,23,0.08);
  padding: 26px;
}
.related { align-self: start; position: sticky; top: 18px; }
.eyebrow, .updated, .meta-row {
  color: var(--muted);
  font-size: 0.78rem;
  font-weight: 850;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
h1 { font-size: clamp(2rem, 5vw, 3.8rem); line-height: 1.02; margin: 0.3em 0; }
h2 { font-size: clamp(1.35rem, 2.2vw, 1.85rem); line-height: 1.18; margin: 0 0 0.65rem; }
.summary { color: #383f4b; font-size: 1.04rem; max-width: 78ch; }
.meta-row { display: flex; flex-wrap: wrap; gap: 10px; margin: 18px 0; }
.meta-row span { background: #f2f3f0; border: 1px solid var(--line); border-radius: 999px; padding: 7px 10px; }
.toc { margin: 20px 0 26px; }
.toc a { border-color: var(--line); color: #343943; background: #f7f8f5; }
.policy-section { border-top: 1px solid var(--line); padding-top: 24px; margin-top: 24px; }
.policy-body p, .policy-body li { color: #2b3038; font-size: 1rem; }
.policy-body p { margin: 0 0 1rem; max-width: 78ch; }
.policy-body code { background: #f1f1ee; border-radius: 5px; padding: 0.1em 0.3em; }
.related h2 { margin-top: 0; }
.site-footer { color: var(--muted); max-width: 1180px; margin: 0 auto; padding: 0 20px 40px; }
@media (max-width: 840px) {
  .page-shell { display: block; padding: 18px 14px 32px; }
  .policy, .related { border-radius: 14px; padding: 18px; }
  .related { margin-top: 18px; position: static; }
  .site-header-inner { padding: 16px 14px; }
}
`,
  );
}

fs.rmSync(siteRoot, { force: true, recursive: true });
writeStyles();
const index = renderIndex();
assertPublicOutput(index, "index");
writeFile(path.join(siteRoot, "index.html"), index);

for (const page of pages) {
  const contents = renderPage(page);
  assertPublicOutput(contents, page.slug);
  writeFile(path.join(siteRoot, page.slug, "index.html"), contents);
}

console.log(`Built ${pages.length + 1} public legal pages into ${siteRoot}`);
