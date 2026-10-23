import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { createHash } from "node:crypto";
import { renderResetPasswordPage, resetPasswordHeaders, renderSignupConfirmationPage, signupConfirmationHeaders } from "../public-site/legal-site/reset-password-page.mjs";

// Execute the actual generated script, not a reimplementation. This deterministic
// DOM/event harness does not claim browser CSP enforcement or Android launch proof.
const html = readFileSync("public-site/legal-site/site/reset-password/index.html", "utf8");
assert.equal(html, renderResetPasswordPage());
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const signupHtml = readFileSync("public-site/legal-site/site/auth-callback/index.html", "utf8");
assert.equal(signupHtml, renderSignupConfirmationPage());
const signupScript = signupHtml.match(/<script>([\s\S]*?)<\/script>/)[1];
const style = html.match(/<style>([\s\S]*?)<\/style>/)[1];
const headers = readFileSync("public-site/legal-site/_headers", "utf8");
assert.equal(readFileSync("public-site/legal-site/site/_headers", "utf8"), headers);
assert.ok(headers.includes(resetPasswordHeaders));
assert.ok(headers.includes(signupConfirmationHeaders));
for (const source of [script, signupScript, style]) {
  assert.ok(headers.includes(`'sha256-${createHash("sha256").update(source).digest("base64")}'`));
}
assert.equal(/<(?:script|img|link|iframe)[^>]+(?:src|href)=/i.test(html), false);
assert.equal(/\b(?:fetch|XMLHttpRequest|sendBeacon|localStorage|sessionStorage|indexedDB|console)\b/.test(script), false);
assert.equal(/<(?:script|img|link|iframe)[^>]+(?:src|href)=/i.test(signupHtml), false);
assert.equal(/\b(?:fetch|XMLHttpRequest|sendBeacon|localStorage|sessionStorage|indexedDB|console)\b/.test(signupScript), false);
assert.ok(signupHtml.includes("does not create an account, confirm your email, accept terms"));
assert.ok(signupHtml.includes("Continue your signup confirmation"));
assert.ok(html.includes("Continue your password reset"));
// Provider-shaped synthetic fixtures, never actual email credentials.
const token = "a".repeat(56);
const valid = `https://chillywoodstream.com/reset-password?token_hash=${token}&type=recovery`;
const signupValid = `https://chillywoodstream.com/auth-callback?token_hash=${token}&type=email`;
const android = "Mozilla/5.0 (Linux; Android 16; Test) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36";
let checks = 16;
function load(url = valid, { agent = android, scrubThrows = false, launchThrows = false, signup = false } = {}) {
  const events = new Map();
  const timers = [];
  const launches = [];
  const scrubs = [];
  const status = { textContent: "" };
  const iosLink = { hidden: true, removeAttribute: () => {} };
  const button = {
    disabled: true, textContent: "Open Chi'llywood",
    addEventListener: (name, handler) => events.set(`button:${name}`, handler),
  };
  const context = {
    URL,
    URLSearchParams,
    navigator: { userAgent: agent },
    document: { getElementById: (id) => ({ "open-app": button, "open-ios": iosLink, status })[id], addEventListener: (name, handler) => events.set(`document:${name}`, handler) },
    window: {
      location: { href: url, assign: (value) => {
        assert.deepEqual(scrubs, [[null, "", signup ? "/auth-callback" : "/reset-password"]], "scrub precedes every launch");
        launches.push(value);
        if (launchThrows) throw new Error("Synthetic blocked launch");
      } },
      history: { replaceState: (...args) => {
        if (scrubThrows) throw new Error("Synthetic blocked history");
        scrubs.push(args);
      } },
      addEventListener: (name, handler) => events.set(name, handler),
      setTimeout: (handler) => timers.push(handler),
    },
  };
  vm.runInNewContext(signup ? signupScript : script, context, { timeout: 1000 });
  assert.equal(launches.length, 0, "load never opens anything");
  assert.equal(status.textContent.includes(token), false, "token never displayed");
  checks += 2;
  return { button, status, launches, scrubs, click: (isTrusted = true) => events.get("button:click")?.({ isTrusted }),
    flush: () => { while (timers.length) timers.shift()(); }, hide: () => events.get("pagehide")?.() };
}
const page = load();
assert.equal(page.button.disabled, false);
page.click(false);
assert.equal(page.launches.length, 0);
page.click();
assert.equal(page.launches[0], `intent://chillywoodstream.com/reset-password?token_hash=${token}&type=recovery#Intent;scheme=https;package=com.chillywood.mobile;end`);
page.click();
assert.equal(page.launches.length, 1);
page.flush();
page.click();
assert.equal(page.launches.length, 2, "cancel/unresolved launch allows only a fresh gesture");
page.hide();
page.flush();
page.click();
assert.equal(page.launches.length, 2);
assert.equal(page.button.disabled, true);
checks += 7;
const hostileInputs = [
  "https://chillywoodstream.com/reset-password", `${valid}&redirect_to=https://evil.example`,
  `${valid}&token_hash=${token}`, `${valid}&type=recovery`, `${valid}&%74ype=recovery`,
  `${valid}&code=synthetic`, `${valid}&access_token=synthetic&refresh_token=synthetic`,
  `${valid}#token_hash=synthetic`, `${valid}#Intent;scheme=evil;end`,
  valid.replace(token, "bad"), valid.replace(token, `${token}%3Bpackage%3Devil`),
  valid.replace(token, `${token}%26redirect_to%3Dhttps%3A%2F%2Fevil.example`),
  valid.replace("type=recovery", "type=signup"), valid.replace("chillywoodstream.com", "evil.example"),
  valid.replace("chillywoodstream.com", "chillywoodstream.com.evil.example"),
  valid.replace("chillywoodstream.com", "user@chillywoodstream.com"),
  valid.replace("chillywoodstream.com", "chillywoodstream.com:444"),
  valid.replace("/reset-password?", "/auth-callback?"), `${valid}&x=1`,
  valid.replace(token, "%ZZ"), valid.replace("https:", "http:"),
  valid.replace("https://chillywoodstream.com/", "chillywoodmobile://"),
  `${valid}&S.browser_fallback_url=https://evil.example`, "not a URL",
  `${valid}&amp;type=recovery`,
];
for (const input of hostileInputs) {
  const hostile = load(input);
  assert.equal(hostile.button.disabled, true);
  hostile.click(); hostile.flush();
  assert.equal(hostile.launches.length, 0);
  checks += 2;
}
for (const agent of ["Desktop Chrome/130.0", `${android} EdgA/1`, `${android} SamsungBrowser/1`, `${android} wv`, "iPhone Safari/1"]) {
  assert.equal(load(valid, { agent }).button.disabled, true);
  checks++;
}
const failedScrub = load(valid, { scrubThrows: true });
assert.equal(failedScrub.button.disabled, true);
failedScrub.click();
assert.equal(failedScrub.launches.length, 0);
const failedLaunch = load(valid, { launchThrows: true });
failedLaunch.click(); failedLaunch.flush();
assert.equal(failedLaunch.button.disabled, false);
assert.ok(failedLaunch.status.textContent.includes("could not continue"));
for (const suffix of ["/", "/index.html"]) {
  assert.equal(load(valid.replace("/reset-password?", `/reset-password${suffix}?`)).button.disabled, false);
}
checks += 6;
const signupPage = load(signupValid, { signup: true });
assert.equal(signupPage.button.disabled, false);
signupPage.click(false);
assert.equal(signupPage.launches.length, 0);
signupPage.click(); signupPage.click();
assert.equal(signupPage.launches.length, 1);
assert.equal(signupPage.launches[0], `intent://chillywoodstream.com/auth-callback?token_hash=${token}&type=email#Intent;scheme=https;package=com.chillywood.mobile;end`);
signupPage.flush(); signupPage.click();
assert.equal(signupPage.launches.length, 2);
signupPage.hide(); signupPage.flush(); signupPage.click();
assert.equal(signupPage.launches.length, 2);
assert.equal(signupPage.button.disabled, true);
checks += 7;
for (const input of hostileInputs.map((input) => input
  .replaceAll("/auth-callback", "/wrong-callback")
  .replaceAll("/reset-password", "/auth-callback")
  .replaceAll("type=recovery", "type=email"))) {
  const hostile = load(input, { signup: true });
  assert.equal(hostile.button.disabled, true);
  hostile.click(); hostile.flush();
  assert.equal(hostile.launches.length, 0);
  checks += 2;
}
for (const [input, signup] of [
  [valid, true], [signupValid, false],
  [signupValid.replace("type=email", "type=recovery"), true],
  [valid.replace("type=recovery", "type=email"), false],
  ...["signup", "invite", "magiclink", "email_change"].map((type) => [signupValid.replace("type=email", `type=${type}`), true]),
  [signupValid.replace(`token_hash=${token}`, "code=synthetic"), true],
  [signupValid.replace(`token_hash=${token}`, "token=synthetic&email=test@example.invalid"), true],
]) {
  const crossAction = load(input, { signup });
  assert.equal(crossAction.button.disabled, true);
  crossAction.click();
  assert.equal(crossAction.launches.length, 0);
  checks += 2;
}
for (const suffix of ["", "/", "/index.html"]) {
  const variant = load(signupValid.replace("/auth-callback?", `/auth-callback${suffix}?`), { signup: true });
  assert.equal(variant.button.disabled, false);
  variant.click();
  assert.equal(variant.launches.length, 1);
  checks += 2;
}
for (const agent of ["Desktop Chrome/130.0", `${android} EdgA/1`, `${android} SamsungBrowser/1`, `${android} wv`, "iPhone Safari/1"]) {
  assert.equal(load(signupValid, { agent, signup: true }).button.disabled, true);
  checks++;
}
const signupFailedScrub = load(signupValid, { signup: true, scrubThrows: true });
assert.equal(signupFailedScrub.button.disabled, true);
signupFailedScrub.click();
assert.equal(signupFailedScrub.launches.length, 0);
const signupFailedLaunch = load(signupValid, { signup: true, launchThrows: true });
signupFailedLaunch.click(); signupFailedLaunch.flush();
assert.equal(signupFailedLaunch.button.disabled, false);
checks += 3;
for (const [base, signup] of [[valid, false], [signupValid, true]]) {
  for (const value of [token, `pkce_${token}`]) {
    const providerShape = load(base.replace(token, value), { signup });
    assert.equal(providerShape.button.disabled, false);
    providerShape.click();
    assert.equal(providerShape.launches.length, 1);
    assert.ok(providerShape.launches[0].includes(`token_hash=${value}&type=`), "preserve exact PKCE prefix");
    checks += 3;
  }
  for (const value of [
    "a".repeat(55), "a".repeat(57), "a".repeat(64),
    `pkce_${"a".repeat(55)}`, `pkce_${"a".repeat(57)}`, `pkce_${"a".repeat(64)}`,
    token.toUpperCase(), `pkce_${token.toUpperCase()}`, `PKCE_${token}`,
    `pkce_pkce_${token}`, `other_${token}`, `pkce-${token}`,
    `${token}%0A`, `${token}%0D`, `pkce_${token}%0A`, `pkce_${token}%0D`,
    `${"a".repeat(55)}%0A`, `pkce_${"a".repeat(55)}%0D`,
    `${token}%3Bpackage%3Devil`, `pkce_${token}%23Intent%3Bscheme%3Devil`,
    `${token}%26type%3Demail`, `${token}%00`,
  ]) {
    const malformed = load(base.replace(token, value), { signup });
    assert.equal(malformed.button.disabled, true);
    malformed.click();
    assert.equal(malformed.launches.length, 0);
    checks += 2;
  }
}
console.log(`Reset/signup landing generated-script behavior passed (${checks} checks; DOM harness, not browser/device proof).`);
