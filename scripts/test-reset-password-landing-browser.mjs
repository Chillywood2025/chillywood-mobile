import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { once } from "node:events";
import { Buffer } from "node:buffer";
import { resetPasswordCsp, renderResetPasswordPage, renderIosHandoffPage, renderSignupConfirmationPage } from "../public-site/legal-site/reset-password-page.mjs";

// Real Chromium executes the generated page with every navigation intercepted.
// All credentials here are synthetic. No live host, Auth API, or app is used.
const html = readFileSync("public-site/legal-site/site/reset-password/index.html", "utf8");
assert.equal(html, renderResetPasswordPage(), "test the actual generated output");
const headers = readFileSync("public-site/legal-site/site/_headers", "utf8");
for (const route of ["/reset-password", "/reset-password/", "/reset-password/index.html"]) {
  assert.ok(headers.includes(`${route}\n  Cache-Control: no-store\n  Referrer-Policy: no-referrer\n  Content-Security-Policy: ${resetPasswordCsp}`));
}
const profile = mkdtempSync(path.join(tmpdir(), "reset-landing-browser-"));
const browser = spawn(process.env.CHROMIUM_BIN || "chromium", [
  "--headless", "--no-sandbox", "--disable-gpu", "--disable-background-networking",
  "--disable-component-update", "--no-first-run", "--no-default-browser-check",
  "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank",
], { stdio: ["ignore", "ignore", "pipe"] });
let socket;
let sequence = 0;
let checks = 0;
const pending = new Map();
const listeners = new Map();
const timeout = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const on = (method, handler) => listeners.set(method, handler);
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++sequence;
  pending.set(id, { resolve, reject });
  socket.send(JSON.stringify({ id, method, params }));
});
const evaluate = async (expression) => {
  const result = await send("Runtime.evaluate", { expression, returnByValue: true });
  if (result.exceptionDetails) throw new Error("Browser evaluation failed");
  return result.result.value;
};
try {
  const endpoint = await new Promise((resolve, reject) => {
    let output = "";
    const timer = setTimeout(() => reject(new Error("Chromium startup timed out")), 15000);
    browser.once("error", reject);
    browser.stderr.on("data", (chunk) => {
      output += chunk;
      const match = output.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) { clearTimeout(timer); resolve(match[1]); }
    });
  });
  const port = new URL(endpoint).port;
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  socket = new WebSocket(targets.find((target) => target.type === "page").webSocketDebuggerUrl);
  await once(socket, "open");
  socket.addEventListener("message", ({ data }) => {
    const message = JSON.parse(data);
    if (message.id) {
      const request = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) request.reject(new Error(message.error.message));
      else request.resolve(message.result);
    } else listeners.get(message.method)?.(message.params);
  });
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Page.addScriptToEvaluateOnNewDocument", { source: "window.__landingCspViolations = []; document.addEventListener('securitypolicyviolation', (event) => window.__landingCspViolations.push(event.violatedDirective));" });
  await send("Fetch.enable", { patterns: [{ urlPattern: "*" }] });
  const android = "Mozilla/5.0 (Linux; Android 16; Test) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36";
  const token = "a".repeat(56);
  const valid = `https://chillywoodstream.com/reset-password?token_hash=${token}&type=recovery`;
  const launches = [];
  const unexpected = [];
  const errors = [];
  const consoleMessages = [];
  let expectedDocument = null;
  let currentHtml = html;
  let currentCsp = resetPasswordCsp;
  const httpsNavigations = [];
  on("Runtime.exceptionThrown", () => errors.push("Uncaught browser exception"));
  on("Runtime.consoleAPICalled", ({ args }) => consoleMessages.push(JSON.stringify(args)));
  on("Page.frameRequestedNavigation", ({ url }) => {
    if (url.startsWith("intent:")) launches.push(url);
    if (url.startsWith("https:")) httpsNavigations.push(url);
  });
  on("Fetch.requestPaused", ({ requestId, resourceType, request }) => {
    if (resourceType !== "Document" || request.url !== expectedDocument) {
      unexpected.push("Unrequested navigation or resource");
      void send("Fetch.failRequest", { requestId, errorReason: "BlockedByClient" });
      return;
    }
    expectedDocument = null;
    void send("Fetch.fulfillRequest", {
      requestId, responseCode: 200,
      responseHeaders: [
        { name: "Content-Type", value: "text/html; charset=utf-8" },
        { name: "Content-Security-Policy", value: currentCsp },
        { name: "Referrer-Policy", value: "no-referrer" },
        { name: "Cache-Control", value: "no-store" },
      ],
      body: Buffer.from(currentHtml).toString("base64"),
    });
  });
  const load = async (url, agent = android, before = "", markup = html) => {
    currentHtml = markup;
    currentCsp = markup.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
    await send("Emulation.setUserAgentOverride", { userAgent: agent });
    let identifier;
    if (before) ({ identifier } = await send("Page.addScriptToEvaluateOnNewDocument", { source: before }));
    let loaded;
    const complete = new Promise((resolve) => { loaded = resolve; });
    on("Page.loadEventFired", loaded);
    expectedDocument = new URL(url).href.split("#")[0];
    await send("Page.navigate", { url });
    await Promise.race([complete, timeout(5000).then(() => { throw new Error("Page load timed out"); })]);
    if (identifier) await send("Page.removeScriptToEvaluateOnNewDocument", { identifier });
    if (!before) assert.equal(await evaluate("location.search + location.hash"), "", "scrub URL before interaction");
    assert.equal(await evaluate("document.body.textContent.includes('" + token + "')"), false);
    assert.equal(await evaluate("localStorage.length + sessionStorage.length"), 0);
    assert.equal(await evaluate("window.__landingCspViolations.length"), 0, "no CSP violations");
    checks += 3;
  };
  const click = async (id = "open-app") => {
    const rect = await evaluate(`(() => { const r = document.getElementById('${id}').getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2}; })()`);
    await send("Input.dispatchMouseEvent", { type: "mousePressed", button: "left", clickCount: 1, ...rect });
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", button: "left", clickCount: 1, ...rect });
    await timeout(30);
  };
  await load(valid);
  assert.equal(launches.length, 0, "no launch on load");
  assert.equal(await evaluate("document.getElementById('open-app').disabled"), false);
  await evaluate("document.getElementById('open-app').click()");
  assert.equal(launches.length, 0, "synthetic/scanner click cannot launch");
  await click();
  assert.equal(launches.length, 1);
  assert.equal(launches[0], `intent://chillywoodstream.com/reset-password?token_hash=${token}&type=recovery#Intent;scheme=https;package=com.chillywood.mobile;end`);
  await click();
  assert.equal(launches.length, 1, "rapid repeated click is latched");
  await timeout(1600);
  await click();
  assert.equal(launches.length, 2, "cancelled/unresolved launch permits a fresh gesture");
  await evaluate("window.dispatchEvent(new PageTransitionEvent('pagehide', {persisted:true}))");
  await timeout(1600);
  await click();
  assert.equal(launches.length, 2, "pagehide clears the in-memory handoff even with an outstanding unlock timer");
  checks += 8;
  await load(valid.replace(token, `pkce_${token}`));
  await click();
  assert.equal(launches.length, 3, "PKCE provider-shaped fixture permits a user gesture");
  assert.ok(launches[2].includes(`token_hash=pkce_${token}&type=recovery`));
  for (const url of [
    "https://chillywoodstream.com/reset-password", `${valid}&redirect_to=https://evil.example`,
    `${valid}&token_hash=${token}`, `${valid}&type=recovery`, `${valid}&code=synthetic`,
    `${valid}&access_token=synthetic&refresh_token=synthetic`, `${valid}#token_hash=synthetic`,
    valid.replace(token, "bad"), valid.replace(token, `${token}%3Bpackage%3Devil`),
    valid.replace("type=recovery", "type=signup"), valid.replace("chillywoodstream.com", "evil.example"),
    valid.replace("/reset-password?", "/auth-callback?"), `${valid}&x=1`,
    valid.replace(token, "%ZZ"), valid.replace("https:", "http:"),
    ...["a".repeat(55), "a".repeat(57), "a".repeat(64), token.toUpperCase(),
      `PKCE_${token}`, `pkce_pkce_${token}`, `other_${token}`, `${token}%0A`, `${token}%0D`,
      `pkce_${token}%0A`, `pkce_${token}%0D`].map((value) => valid.replace(token, value)),
  ]) {
    await load(url);
    assert.equal(await evaluate("document.getElementById('open-app').disabled"), true);
    await click();
    assert.equal(launches.length, 3, "hostile/missing input never launches");
    checks += 2;
  }
  for (const agent of ["Desktop Chrome/130.0", `${android} EdgA/1`, `${android} SamsungBrowser/1`, `${android} wv`, "iPhone Safari/1"]) {
    await load(valid, agent);
    assert.equal(await evaluate("document.getElementById('open-app').disabled"), true);
    checks++;
  }
  await load(valid, android, "history.replaceState = () => { throw new Error('denied'); };");
  // Failed scrub is separately asserted below because this document retains URL.
  assert.equal(await evaluate("document.getElementById('open-app').disabled"), true);
  // Chromium with Safari UA proves native-anchor default URL capture, NOT iOS
  // dispatch. Every authorized document is fulfilled locally, never requested.
  const safari = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1";
  for (const type of ["recovery", "email"]) for (const hash of [token, `pkce_${token}`]) {
    const route = type === "email" ? "/auth-callback" : "/reset-password";
    const canonical = `https://chillywoodstream.com${route}?token_hash=${hash}&type=${type}`;
    const intermediate = `https://chillywood-legal.pages.dev/auth-handoff#token_hash=${hash}&type=${type}`;
    await load(canonical, safari, "", type === "email" ? renderSignupConfirmationPage() : html);
    currentHtml = renderIosHandoffPage();
    currentCsp = currentHtml.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
    expectedDocument = intermediate.split("#")[0];
    const firstCount = httpsNavigations.length;
    await click();
    await timeout(150);
    assert.equal(httpsNavigations[firstCount], intermediate, "first gesture transports fragment only");
    assert.equal(await evaluate("location.search + location.hash"), "");
    assert.equal(await evaluate("document.getElementById('open-ios').href"), canonical.split("?")[0]);
    const secondCount = httpsNavigations.length;
    await evaluate("document.getElementById('open-ios').click()");
    assert.equal(httpsNavigations.length, secondCount, "synthetic anchor click is prevented");
    expectedDocument = canonical;
    currentHtml = "<!doctype html><title>Locally intercepted final navigation</title>";
    currentCsp = "default-src 'none'";
    await click("open-ios");
    await timeout(150);
    assert.equal(httpsNavigations[secondCount], canonical, "native default captures href set by trusted listener");
    checks += 5;
  }
  assert.equal(unexpected.length, 0, "generated page made no external/subresource requests");
  assert.equal(errors.length, 0, "no browser exceptions");
  assert.equal(consoleMessages.some((message) => message.includes(token)), false, "no token in console");
  console.log(`Auth landing Chromium behavior passed (${checks + 2} checks; includes native iOS-anchor ordering, NOT Safari or installed-app proof).`);
} finally {
  socket?.close();
  browser.kill("SIGTERM");
  await Promise.race([once(browser, "exit"), timeout(3000)]);
  rmSync(profile, { recursive: true, force: true });
}
