import { createHash } from "node:crypto";

// These landing pages only hand an HTTPS recovery/signup link to the installed Android
// package after a trusted click. It never verifies, exchanges, or stores it.
function authLanding(signup) {
  const route = signup ? "/auth-callback" : "/reset-password";
  const type = signup ? "email" : "recovery";
  const purpose = signup ? "signup confirmation" : "reset";
  const button = document.getElementById("open-app");
  const status = document.getElementById("status");
  let target = null;
  let pending = false;
  let source;
  try {
    source = new URL(window.location.href);
    // Scrub before enabling any action. A failed scrub must fail closed.
    window.history.replaceState(null, "", route);
  } catch {
    status.textContent = `Close this page and open the newest ${purpose} email in Chrome on your Android phone.`;
    return;
  }

  const params = source.searchParams;
  const hash = params.get("token_hash");
  const valid = source.origin === "https://chillywoodstream.com"
    && [route, `${route}/`, `${route}/index.html`].includes(source.pathname)
    && !source.username && !source.password && !source.hash
    && [...params.keys()].length === 2
    && params.getAll("token_hash").length === 1
    && params.getAll("type").length === 1
    && params.get("type") === type
    // Supabase GenerateTokenHash uses SHA-224 (56 lowercase hex); PKCE
    // mailers retain a literal pkce_ prefix. Never normalize or strip it.
    // Explicit length also rejects the terminal-newline behavior of JS `$`.
    && typeof hash === "string" && (hash.length === 56 || hash.length === 61)
    && /^(?:pkce_)?[a-f0-9]{56}$/.test(hash);
  if (valid) {
    const canonical = new URL(`https://chillywoodstream.com${route}`);
    canonical.searchParams.set("token_hash", hash);
    canonical.searchParams.set("type", type);
    target = `intent://${canonical.host}${canonical.pathname}${canonical.search}#Intent;scheme=https;package=com.chillywood.mobile;end`;
  }
  source = null;

  if (!target) {
    status.textContent = `This page is missing a supported ${purpose} link. Open the newest ${purpose} email. If it no longer works, return to the app for help requesting a fresh email.`;
    return;
  }
  // Conservative browser support. In-app mail browsers and other platforms
  // receive instructions, not an untested or custom-scheme credential handoff.
  const agent = navigator.userAgent;
  const supported = /Android/.test(agent) && /Chrome\//.test(agent)
    && !/; wv\)|\bwv\b|EdgA\/|OPR\/|SamsungBrowser\//.test(agent);
  if (!supported) {
    target = null;
    status.textContent = `Open the original ${purpose} email link in Chrome on your Android phone. This browser cannot open the app from this page. Do not copy or share the link.`;
    return;
  }
  button.disabled = false;
  status.textContent = "Ready to open the app. This page has not checked whether your link is valid or expired.";

  button.addEventListener("click", (event) => {
    if (!event.isTrusted || pending || !target) return;
    pending = true;
    button.disabled = true;
    status.textContent = "Choose Chi'llywood if prompted. If nothing opens or you cancel, make sure the official app is installed and try again. Only the app can check whether this link is still valid.";
    try {
      window.location.assign(target);
    } catch {
      status.textContent = "The browser could not open Chi'llywood. Make sure the official app is installed, then reopen the original email link in Chrome.";
    }
    // This timer only unlocks a fresh user gesture; it never launches anything.
    window.setTimeout(() => {
      pending = false;
      if (target) {
        button.disabled = false;
        button.textContent = "Try opening Chi'llywood again";
      }
    }, 1500);
  });
  window.addEventListener("pagehide", () => {
    target = null;
    button.disabled = true;
    status.textContent = `For your privacy, this page has cleared the ${purpose} link. Reopen the original email if you need to try again.`;
  });
}

const scriptFor = (signup) => `(${authLanding.toString()})(${signup ? "true" : "false"});`;
// Match the existing public site's ink, page, surface, crimson, and header palette.
const style = "*{box-sizing:border-box}body{margin:0;background:#f5f6f3;color:#17181c;font:18px/1.65 system-ui,sans-serif}header{background:#101217;color:#fff;padding:1.25rem;font-weight:800}main{max-width:36rem;margin:6vh auto;padding:1.5rem;background:#fff;border:1px solid #dfe3df;border-radius:1rem}h1{font-size:2rem;line-height:1.2}button{padding:1rem;border:0;border-radius:.6rem;background:#b4172a;color:#fff;font:inherit;font-weight:700;cursor:pointer}button:disabled{opacity:.55;cursor:default}button:focus-visible{outline:3px solid #17181c;outline-offset:4px}p{overflow-wrap:anywhere}.note{font-size:1rem;color:#5c6370}@media(max-width:40rem){main{margin:1rem}}";
const hashSource = (value) => `'sha256-${createHash("sha256").update(value).digest("base64")}'`;
const cspFor = (signup) => `default-src 'none'; script-src ${hashSource(scriptFor(signup))}; style-src ${hashSource(style)}; connect-src 'none'; img-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; object-src 'none'`;
export const resetPasswordCsp = cspFor(false);
export const signupConfirmationCsp = cspFor(true);

const headersFor = (path, csp) => [path, `${path}/`, `${path}/index.html`]
  .map((route) => `${route}\n  Cache-Control: no-store\n  Referrer-Policy: no-referrer\n  Content-Security-Policy: ${csp}\n  X-Content-Type-Options: nosniff\n  X-Frame-Options: DENY\n  X-Robots-Tag: noindex, nofollow\n  Permissions-Policy: camera=(), microphone=(), geolocation=()\n`).join("\n");
export const resetPasswordHeaders = headersFor("/reset-password", resetPasswordCsp);
export const signupConfirmationHeaders = headersFor("/auth-callback", signupConfirmationCsp);

function renderPage(signup) {
  const purpose = signup ? "signup confirmation" : "password reset";
  const description = signup ? "This page does not create an account, confirm your email, accept terms, or check your link." : "This page does not reset your password or check your link.";
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="referrer" content="no-referrer">
<meta http-equiv="Content-Security-Policy" content="${cspFor(signup).replace("; frame-ancestors 'none'", "")}">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>Open Chi'llywood ${purpose}</title>
<style>${style}</style>
</head><body><header>Chi'llywood</header><main>
<h1>Continue your ${purpose}</h1>
<p>${description} Continue in the official Chi'llywood Android app.</p>
<button id="open-app" type="button" disabled>Open Chi'llywood</button>
<p id="status" role="status" aria-live="polite">Enable JavaScript in Chrome on your Android phone to continue. Do not copy or share your link.</p>
<p class="note">App missing? Install the official Chi'llywood app through your usual Google Play listing, then reopen the newest ${purpose} email. If the app says the link is expired or already used, return to the app for help requesting a fresh email. This page never sends an email.</p>
<noscript><p>JavaScript is off, so this page cannot open the app or clear the link from the address bar. Close this page when finished.</p></noscript>
</main><script>${scriptFor(signup)}</script></body></html>\n`;
}
export const renderResetPasswordPage = () => renderPage(false);
export const renderSignupConfirmationPage = () => renderPage(true);
