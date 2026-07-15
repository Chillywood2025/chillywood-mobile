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
const assetLinksSourcePath = path.join(scriptDir, "assetlinks.json");
const appleAppSiteAssociationSourcePath = path.join(scriptDir, "apple-app-site-association");
const headersSourcePath = path.join(scriptDir, "_headers");
const lastUpdated = "May 21, 2026";
const publicDmcaReportSlug = "copyright-report";
const publicDmcaReportUrl = `${LEGAL_PUBLIC_BASE_URL}/${publicDmcaReportSlug}`;
const publicSupabaseUrl = String(
  process.env.PUBLIC_SUPABASE_URL
  || process.env.EXPO_PUBLIC_SUPABASE_URL
  || "https://bmkkhihfbmsnnmcqkoly.supabase.co",
).trim();
const publicSupabaseAnonKey = String(
  process.env.PUBLIC_SUPABASE_ANON_KEY
  || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
  || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJta2toaWhmYm1zbm5tY3Frb2x5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzExNjE1ODUsImV4cCI6MjA4NjczNzU4NX0.j45qJsnaZelO4fND2LGOwH66cb7qHr1LY0t31Ck-TcQ",
).trim();
const dmcaEvidenceBucket = "dmca-evidence";
const dmcaAttachmentMaxBytes = 10 * 1024 * 1024;
const dmcaAttachmentMimeTypes = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/pdf",
  "text/plain",
];

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

const navLinks = [
  ...pages.map(({ slug, title }) => ({ slug, title })),
  { slug: publicDmcaReportSlug, title: "Report Copyright" },
];

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function slugify(value) {
  return String(value)
    .replace(/['\u2019\u2018`\u00b4]+/g, "")
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

function renderCopyrightReportPage() {
  const contentTypeOptions = [
    ["creator_video", "Creator video"],
    ["profile_post", "Profile post"],
    ["profile_post_comment", "Profile post comment"],
    ["creator_video_comment", "Creator video comment"],
    ["comment", "Comment"],
    ["reply", "Reply"],
    ["social_attachment", "Social attachment"],
    ["attachment", "Attachment"],
    ["live_room", "Live room"],
    ["channel", "Platform"],
    ["other", "Other"],
  ];

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Report Copyright Infringement | Chi'llywood</title>
  <meta name="description" content="Submit a public copyright or DMCA notice to Chi'llywood.">
  <link rel="stylesheet" href="/assets/styles.css">
</head>
<body>
  <header class="site-header">
    <div class="site-header-inner">
      <a class="brand" href="/">Chi'llywood</a>
      <nav class="site-nav" aria-label="Public legal pages">
${renderNav(publicDmcaReportSlug)}
      </nav>
    </div>
  </header>
  <main class="page-shell">
    <article class="policy">
      <p class="eyebrow">Chi'llywood Copyright</p>
      <h1>Report Copyright Infringement</h1>
      <p class="summary">Use this public form for copyright or media-rights notices. The form creates a real DMCA case for Chi'llywood review and returns a case number.</p>
      <div class="meta-row">
        <span>Public URL: ${escapeHtml(publicDmcaReportUrl)}</span>
        <span>Manual email intake: ${escapeHtml(LEGAL_SUPPORT_EMAIL)}</span>
      </div>
      <div class="notice-box">
        <strong>Evidence attachments:</strong> Optional PNG, JPEG, WebP, PDF, and plain-text files upload to private DMCA evidence storage. Automated malware scanning is not configured; uploaded files are marked pending manual review.
      </div>
      <form class="dmca-form" id="dmca-form" novalidate>
        <section class="form-section">
          <h2>Reporter</h2>
          <label>Claimant or authorized agent name <input name="reporterName" required autocomplete="name"></label>
          <label>Email address <input name="reporterEmail" required type="email" autocomplete="email"></label>
          <label>Company or organization <input name="reporterCompany" autocomplete="organization"></label>
          <label>Phone <input name="reporterPhone" autocomplete="tel"></label>
          <label>Mailing address <textarea name="reporterAddress" rows="3" autocomplete="street-address"></textarea></label>
          <label>Reporter role
            <select name="reporterIsOwner">
              <option value="true">Copyright owner</option>
              <option value="false">Authorized agent</option>
            </select>
          </label>
          <label>Authorized agent name <input name="authorizedAgentName"></label>
        </section>
        <section class="form-section">
          <h2>Copyrighted Work</h2>
          <label>Copyright owner name <input name="copyrightOwnerName" required></label>
          <label>Description of copyrighted work <textarea name="copyrightedWorkDescription" rows="5" required></textarea></label>
          <label>Copyrighted work URLs, one per line <textarea name="copyrightedWorkUrls" rows="3"></textarea></label>
        </section>
        <section class="form-section">
          <h2>Allegedly Infringing Material</h2>
          <label>Content type
            <select name="contentType">
${contentTypeOptions.map(([value, label]) => `              <option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`).join("\n")}
            </select>
          </label>
          <label>Content id, if known <input name="contentId"></label>
          <label>Chi'llywood URL or location <input name="contentUrl" required></label>
          <label>Description of allegedly infringing material <textarea name="infringingMaterialDescription" rows="5" required></textarea></label>
        </section>
        <section class="form-section">
          <h2>Evidence Attachments</h2>
          <label>Screenshots, PDFs, or notes <input name="attachments" type="file" multiple accept="${dmcaAttachmentMimeTypes.join(",")}"></label>
          <p class="field-hint">Optional. Maximum 10 MB per file. Files are private to legal operators and stay pending manual malware review.</p>
        </section>
        <section class="form-section">
          <h2>Required Statements</h2>
          <label class="check-row"><input name="goodFaithStatement" type="checkbox" required> I have a good-faith belief that the reported use is not authorized by the copyright owner, the owner's agent, or the law.</label>
          <label class="check-row"><input name="accuracyPenaltyPerjuryStatement" type="checkbox" required> I state under penalty of perjury that the information in this notice is accurate and that I am authorized to act for the copyright owner.</label>
          <label>Electronic signature <input name="electronicSignature" required></label>
        </section>
        <div class="form-actions">
          <button type="submit">Submit Copyright Notice</button>
          <p id="dmca-status" role="status" aria-live="polite"></p>
        </div>
      </form>
      <script>
(() => {
  const SUPABASE_URL = ${JSON.stringify(publicSupabaseUrl)};
  const SUPABASE_ANON_KEY = ${JSON.stringify(publicSupabaseAnonKey)};
  const EVIDENCE_BUCKET = ${JSON.stringify(dmcaEvidenceBucket)};
  const MAX_ATTACHMENT_BYTES = ${JSON.stringify(dmcaAttachmentMaxBytes)};
  const ALLOWED_ATTACHMENT_TYPES = ${JSON.stringify(dmcaAttachmentMimeTypes)};
  const form = document.getElementById("dmca-form");
  const status = document.getElementById("dmca-status");
  const button = form.querySelector("button[type='submit']");
  const setStatus = (message, tone = "") => {
    status.textContent = message;
    status.dataset.tone = tone;
  };
  const text = (data, key) => String(data.get(key) || "").trim();
  const workUrls = (value) => String(value || "")
    .split(/\\n|,/)
    .map((entry) => entry.trim())
    .filter(Boolean);
  const sanitizeFileName = (value) => {
    const cleaned = String(value || "dmca-evidence")
      .replace(/[\\\\/]+/g, "-")
      .replace(/[^A-Za-z0-9._ -]/g, "-")
      .replace(/\\s+/g, " ")
      .trim();
    return cleaned.slice(0, 96) || "dmca-evidence.txt";
  };
  const objectName = (fileName) => Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10) + "-" + sanitizeFileName(fileName);
  const storageObjectUrl = (objectPath) => SUPABASE_URL.replace(/\\/$/, "") + "/storage/v1/object/" + EVIDENCE_BUCKET + "/" + objectPath.split("/").map(encodeURIComponent).join("/");
  const uploadAttachment = async ({ caseId, attachmentToken, file }) => {
    const mimeType = String(file.type || "").toLowerCase();
    if (!ALLOWED_ATTACHMENT_TYPES.includes(mimeType)) throw new Error(file.name + " is not an allowed DMCA evidence type.");
    if (!file.size || file.size > MAX_ATTACHMENT_BYTES) throw new Error(file.name + " must be 10 MB or smaller.");
    if (!attachmentToken) throw new Error("Attachment upload could not be prepared for this case.");
    const objectPath = "public-intake/" + caseId + "/" + attachmentToken + "/" + objectName(file.name);
    const upload = await fetch(storageObjectUrl(objectPath), {
      method: "POST",
      headers: {
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": "Bearer " + SUPABASE_ANON_KEY,
        "Content-Type": mimeType,
        "x-upsert": "false"
      },
      body: file
    });
    if (!upload.ok) {
      const text = await upload.text().catch(() => "");
      throw new Error(text || "Unable to upload " + file.name + ".");
    }
    const metadata = await fetch(SUPABASE_URL.replace(/\\/$/, "") + "/rest/v1/rpc/submit_dmca_attachment_metadata", {
      method: "POST",
      headers: {
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": "Bearer " + SUPABASE_ANON_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        p_payload: {
          attachmentToken,
          caseId,
          fileName: file.name,
          mimeType,
          objectPath,
          sizeBytes: file.size,
          source: "public_notice"
        }
      })
    });
    const metadataBody = await metadata.json().catch(() => null);
    if (!metadata.ok) {
      const message = metadataBody && (metadataBody.message || metadataBody.error || metadataBody.details)
        ? String(metadataBody.message || metadataBody.error || metadataBody.details)
        : "Unable to record attachment metadata for " + file.name + ".";
      throw new Error(message);
    }
  };

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    button.disabled = true;
    setStatus("Public DMCA form is not available right now. Contact support@chillywoodstream.com to file a copyright notice.", "error");
    return;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    setStatus("");
    const data = new FormData(form);
    const files = Array.from(form.elements.attachments && form.elements.attachments.files ? form.elements.attachments.files : []);
    const payload = {
      accuracyPenaltyPerjuryStatement: data.get("accuracyPenaltyPerjuryStatement") === "on",
      copyrightOwnerName: text(data, "copyrightOwnerName"),
      copyrightedWorkDescription: text(data, "copyrightedWorkDescription"),
      copyrightedWorkUrls: workUrls(data.get("copyrightedWorkUrls")),
      contentId: text(data, "contentId") || null,
      contentType: text(data, "contentType") || "other",
      contentUrl: text(data, "contentUrl") || null,
      electronicSignature: text(data, "electronicSignature"),
      goodFaithStatement: data.get("goodFaithStatement") === "on",
      infringingMaterialDescription: text(data, "infringingMaterialDescription"),
      reporterAddress: text(data, "reporterAddress") || null,
      reporterCompany: text(data, "reporterCompany") || null,
      reporterEmail: text(data, "reporterEmail"),
      reporterIsOwner: text(data, "reporterIsOwner") !== "false",
      reporterName: text(data, "reporterName"),
      reporterPhone: text(data, "reporterPhone") || null,
      authorizedAgentName: text(data, "authorizedAgentName") || null
    };

    const missing = [];
    if (!payload.reporterName) missing.push("reporter name");
    if (!payload.reporterEmail || !payload.reporterEmail.includes("@")) missing.push("valid reporter email");
    if (!payload.copyrightOwnerName) missing.push("copyright owner name");
    if (!payload.copyrightedWorkDescription) missing.push("copyrighted work description");
    if (!payload.contentId && !payload.contentUrl) missing.push("content URL or id");
    if (!payload.infringingMaterialDescription) missing.push("infringing material description");
    if (!payload.goodFaithStatement) missing.push("good-faith statement");
    if (!payload.accuracyPenaltyPerjuryStatement) missing.push("accuracy and authority statement");
    if (!payload.electronicSignature) missing.push("electronic signature");
    for (const file of files) {
      const mimeType = String(file.type || "").toLowerCase();
      if (!ALLOWED_ATTACHMENT_TYPES.includes(mimeType)) missing.push(file.name + " allowed file type");
      if (!file.size || file.size > MAX_ATTACHMENT_BYTES) missing.push(file.name + " under 10 MB");
    }
    if (missing.length) {
      setStatus("Please provide: " + missing.join(", ") + ".", "error");
      return;
    }

    button.disabled = true;
    button.textContent = "Submitting...";
    try {
      const response = await fetch(SUPABASE_URL.replace(/\\/$/, "") + "/rest/v1/rpc/submit_dmca_notice", {
        method: "POST",
        headers: {
          "apikey": SUPABASE_ANON_KEY,
          "Authorization": "Bearer " + SUPABASE_ANON_KEY,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ p_payload: payload })
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        const message = body && (body.message || body.error || body.details)
          ? String(body.message || body.error || body.details)
          : "Unable to submit this copyright notice right now.";
        throw new Error(message);
      }
      const row = Array.isArray(body) ? body[0] : body;
      let uploadedCount = 0;
      for (const file of files) {
        await uploadAttachment({ caseId: row && row.id, attachmentToken: row && row.attachment_token, file });
        uploadedCount += 1;
      }
      setStatus("Copyright notice received. Case " + (row && row.case_number ? row.case_number : "recorded") + " has been created for review." + (uploadedCount ? " " + uploadedCount + " evidence file" + (uploadedCount === 1 ? "" : "s") + " uploaded and marked pending manual malware review." : ""), "success");
      form.reset();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to submit this copyright notice right now.", "error");
    } finally {
      button.disabled = false;
      button.textContent = "Submit Copyright Notice";
    }
  });
})();
      </script>
    </article>
    <aside class="related" aria-label="Related policy links">
      <h2>Legal Pages</h2>
      <div class="related-links">
${renderNav(publicDmcaReportSlug)}
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

function writeAssetLinks() {
  const contents = fs.readFileSync(assetLinksSourcePath, "utf8");
  JSON.parse(contents);
  writeFile(path.join(siteRoot, ".well-known", "assetlinks.json"), contents);
}

function writeAppleAppSiteAssociation() {
  const contents = fs.readFileSync(appleAppSiteAssociationSourcePath, "utf8");
  JSON.parse(contents);
  writeFile(path.join(siteRoot, ".well-known", "apple-app-site-association"), contents);
}

function writeHostingHeaders() {
  const contents = fs.readFileSync(headersSourcePath, "utf8");
  writeFile(path.join(siteRoot, "_headers"), contents);
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
.notice-box { background: #fff5e8; border: 1px solid #edc88e; border-radius: 10px; color: #3d3020; margin: 20px 0; padding: 14px; }
.dmca-form { display: grid; gap: 22px; margin-top: 22px; }
.form-section { border-top: 1px solid var(--line); display: grid; gap: 12px; padding-top: 20px; }
.dmca-form label { color: #2b3038; display: grid; font-size: 0.9rem; font-weight: 760; gap: 6px; }
.field-hint { color: var(--muted); font-size: 0.88rem; font-weight: 650; margin: -2px 0 0; }
.dmca-form input, .dmca-form textarea, .dmca-form select {
  background: #fbfcfa;
  border: 1px solid #cfd5cf;
  border-radius: 8px;
  color: #17181c;
  font: inherit;
  font-weight: 600;
  padding: 10px 11px;
  width: 100%;
}
.check-row { align-items: flex-start; display: flex !important; gap: 10px !important; line-height: 1.45; }
.check-row input { margin-top: 0.25em; width: auto; }
.form-actions { display: grid; gap: 10px; }
.form-actions button {
  background: var(--accent);
  border: 0;
  border-radius: 999px;
  color: #fff;
  cursor: pointer;
  font: inherit;
  font-weight: 900;
  padding: 13px 18px;
}
.form-actions button:disabled { cursor: not-allowed; opacity: 0.6; }
#dmca-status { font-weight: 800; margin: 0; }
#dmca-status[data-tone="success"] { color: #167340; }
#dmca-status[data-tone="error"] { color: #a51224; }
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
writeAssetLinks();
writeAppleAppSiteAssociation();
writeHostingHeaders();
writeStyles();
const index = renderIndex();
assertPublicOutput(index, "index");
writeFile(path.join(siteRoot, "index.html"), index);

for (const page of pages) {
  const contents = renderPage(page);
  assertPublicOutput(contents, page.slug);
  writeFile(path.join(siteRoot, page.slug, "index.html"), contents);
}

const copyrightReport = renderCopyrightReportPage();
assertPublicOutput(copyrightReport, publicDmcaReportSlug);
writeFile(path.join(siteRoot, publicDmcaReportSlug, "index.html"), copyrightReport);

console.log(`Built ${pages.length + 2} public legal pages into ${siteRoot}`);
