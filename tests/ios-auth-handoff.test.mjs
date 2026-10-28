import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { renderResetPasswordPage, renderSignupConfirmationPage, renderIosHandoffPage, iosHandoffHeaders } from "../public-site/legal-site/reset-password-page.mjs";

// Actual generated scripts with deterministic DOM/default-action simulation.
// This is not Safari execution or installed-device Universal Link evidence.
const hash = "a".repeat(56); // Provider-shaped synthetic data only.
const safari = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1";
const pages = [renderResetPasswordPage(), renderSignupConfirmationPage(), renderIosHandoffPage()];
const paths = ["reset-password", "auth-callback", "auth-handoff"];
const canonical = (type, token = hash) => `https://chillywoodstream.com/${type === "email" ? "auth-callback" : "reset-password"}?token_hash=${token}&type=${type}`;
const bridge = (type, token = hash) => `https://chillywood-legal.pages.dev/auth-handoff/#token_hash=${token}&type=${type}`;

function load(url, index = 2, options = {}) {
  const events = new Map();
  const timers = [];
  const navigations = [];
  const scrubs = [];
  const element = (id) => ({
    hidden: id === "open-ios", disabled: true, textContent: "", attrs: {},
    addEventListener: (event, fn) => events.set(`${id}:${event}`, fn),
    removeAttribute(name) { delete this.attrs[name]; if (name === "href") delete this.href; },
    setAttribute(name, value) { this.attrs[name] = value; },
  });
  const button = element("open-app"), link = element("open-ios"), status = element("status");
  const document = {
    visibilityState: options.hidden ? "hidden" : "visible",
    getElementById: (id) => ({ "open-app": button, "open-ios": link, status })[id],
    addEventListener: (event, fn) => events.set(`document:${event}`, fn),
  };
  const context = {
    URL, URLSearchParams, document,
    navigator: { userAgent: options.agent ?? safari, platform: options.platform, maxTouchPoints: options.touch },
    window: {
      location: { href: url, assign: (value) => { navigations.push(value); } },
      history: { replaceState: (...args) => { if (options.scrubThrows) throw Error("synthetic"); scrubs.push(args); } },
      addEventListener: (event, fn) => events.set(event, fn),
      setTimeout: (fn) => timers.push(fn),
    },
  };
  const script = pages[index].match(/<script>([\s\S]*?)<\/script>/)[1];
  vm.runInNewContext(script, context, { timeout: 1000 });
  assert.equal(navigations.length, 0, "load never navigates");
  assert.ok(!status.textContent.includes(hash), "no visible token");
  const event = (target, kind, overrides = {}) => {
    let prevented = false;
    const ev = { isTrusted: true, button: 0, preventDefault: () => { prevented = true; }, ...overrides };
    events.get(`${target}:${kind}`)?.(ev);
    // Model native anchor default AFTER the listener; real browser tested separately.
    if (target === "open-ios" && kind === "click" && !prevented && link.href) navigations.push(link.href);
    return prevented;
  };
  return { button, link, status, scrubs, navigations, event,
    flush: () => { while (timers.length) timers.shift()(); },
    hide: () => events.get("pagehide")?.(),
    restore: () => events.get("pageshow")?.({ persisted: true }),
    background: () => { document.visibilityState = "hidden"; events.get("document:visibilitychange")?.(); },
  };
}

test("all generated pages and nine header variants have matching restrictive CSP", () => {
  const headers = readFileSync("public-site/legal-site/_headers", "utf8");
  assert.equal(headers, readFileSync("public-site/legal-site/site/_headers", "utf8"));
  assert.ok(headers.includes(iosHandoffHeaders));
  pages.forEach((html, index) => {
    assert.equal(html, readFileSync(`public-site/legal-site/site/${paths[index]}/index.html`, "utf8"));
    for (const tag of ["script", "style"]) {
      const source = html.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`))[1];
      assert.ok(headers.includes(`'sha256-${createHash("sha256").update(source).digest("base64")}'`));
    }
    assert.equal(/\b(?:fetch|XMLHttpRequest|sendBeacon|localStorage|sessionStorage|indexedDB|console)\b/.test(html), false);
    assert.equal(/<(?:script|img|link|iframe)[^>]+(?:src|href)=/i.test(html), false);
    for (const suffix of ["", "/", "/index.html"]) {
      const section = headers.split(`/${paths[index]}${suffix}\n`)[1]?.split("\n\n")[0];
      for (const value of ["Cache-Control: no-store", "Referrer-Policy: no-referrer", "connect-src 'none'", "frame-ancestors 'none'", "! NEL", "! Report-To"]) assert.ok(section?.includes(value));
    }
  });
});

for (const type of ["recovery", "email"]) for (const token of [hash, `pkce_${hash}`]) {
  test(`${type} ${token.startsWith("pkce_") ? "PKCE" : "bare"}: two explicit gestures, unchanged canonical input`, () => {
    const start = load(canonical(type, token), type === "email" ? 1 : 0);
    assert.equal(start.button.disabled, false);
    start.event("open-app", "click", { isTrusted: false });
    assert.equal(start.navigations.length, 0);
    start.event("open-app", "click");
    assert.deepEqual(start.navigations, [bridge(type, token)]);
    assert.equal(new URL(start.navigations[0]).search, "");
    assert.equal(new URL(start.navigations[0]).pathname, "/auth-handoff/", "enter the hosted 200 route without a fragment-carrying redirect");
    const next = load(start.navigations[0]);
    assert.deepEqual(next.scrubs, [[null, "", "/auth-handoff"]]);
    assert.equal(next.link.hidden, false);
    assert.equal(next.link.href, canonical(type).split("?")[0]);
    assert.equal(next.event("open-ios", "click", { isTrusted: false }), true);
    assert.equal(next.navigations.length, 0);
    assert.equal(next.event("open-ios", "click"), false);
    assert.deepEqual(next.navigations, [canonical(type, token)]);
    assert.equal(next.event("open-ios", "click"), true);
    next.flush();
    assert.equal(next.link.href.includes(token), false, "cancelled navigation clears token href before retry");
    next.event("open-ios", "click");
    assert.equal(next.navigations.length, 2);
    next.hide(); next.flush();
    assert.equal(next.link.href, undefined);
    next.event("open-ios", "click");
    assert.equal(next.navigations.length, 2);
  });
}

for (const suffix of ["", "/index.html"]) test(`bridge alias ${suffix}`, () => {
  assert.equal(load(bridge("email").replace("/auth-handoff/#", `/auth-handoff${suffix}#`)).link.hidden, false);
});

const hostile = [
  "https://chillywood-legal.pages.dev/auth-handoff", bridge("invite"), bridge("signup"), bridge("magiclink"), bridge("email_change"),
  bridge("recovery") + "&type=recovery", bridge("recovery") + "&%74ype=recovery", bridge("email") + `&token_hash=${hash}`,
  ...["code=x", "token=x", "access_token=x", "refresh_token=x", "redirect_to=https://evil.invalid", "destination=https://evil.invalid", "browser_fallback_url=x"].map((param) => bridge("email") + "&" + param),
  bridge("email").replace("#", "?"), bridge("email").replace("#", "?x=1#"),
  bridge("email").replace("#", "?#"), bridge("email") + "&", bridge("email").replace("&type", "&&type"),
  bridge("email").replace("https:", "http:"), bridge("email").replace("pages.dev", "pages.dev.evil.invalid"),
  bridge("email").replace("https://", "https://user@"), bridge("email").replace("pages.dev/", "pages.dev:444/"),
  bridge("email").replace("chillywood-legal.pages.dev", "chillywoodstream.com"),
  bridge("email").replace("/auth-handoff", "/auth-callback"), bridge("email") + "#Intent;end",
  ...["a".repeat(55), "a".repeat(57), "a".repeat(64), hash.toUpperCase(), `PKCE_${hash}`, `pkce_pkce_${hash}`, `other_${hash}`, `${hash}%0A`, `${hash}%0D`, `${hash}%3B`, "%ZZ", "%C0%AF"].map((value) => bridge("email", value)),
];
hostile.forEach((url, index) => test(`reject hostile bridge input ${index + 1}`, () => {
  const page = load(url);
  assert.equal(page.link.hidden, true);
  assert.equal(page.link.href, undefined);
  page.event("open-ios", "click"); page.flush();
  assert.equal(page.navigations.length, 0);
}));

for (const state of ["hide", "background", "restore"]) for (const index of [0, 1, 2]) test(`${state} invalidates page ${index}`, () => {
  const page = load(index === 2 ? bridge("email") : canonical(index ? "email" : "recovery"), index);
  page[state](); page.flush();
  page.event("open-app", "click"); page.event("open-ios", "click");
  assert.equal(page.navigations.length, 0);
  assert.equal(page.link.href, undefined);
  assert.equal(page.button.disabled, true);
});
for (const index of [0, 1, 2]) test(`scrub failure closes page ${index}`, () => {
  const page = load(index === 2 ? bridge("email") : canonical(index ? "email" : "recovery"), index, { scrubThrows: true });
  assert.equal(page.button.disabled, true); assert.equal(page.link.hidden, true);
});
test("bridge disallows alternate click modes and unrelated browsers", () => {
  assert.equal(load(bridge("email"), 2, { hidden: true }).link.hidden, true);
  const page = load(bridge("email"));
  for (const modifier of ["metaKey", "ctrlKey", "altKey", "shiftKey"]) assert.equal(page.event("open-ios", "click", { [modifier]: true }), true);
  assert.equal(page.event("open-ios", "click", { button: 1 }), true);
  assert.equal(page.event("open-ios", "auxclick"), true);
  assert.equal(page.event("open-ios", "contextmenu"), true);
  assert.equal(page.navigations.length, 0);
  for (const agent of [safari + " CriOS/1", safari + " FxiOS/1", safari + " EdgiOS/1", safari.replace("Version/18.0", ""), "Android Chrome/1", "Desktop Safari/1"]) {
    assert.equal(load(bridge("email"), 2, { agent }).link.hidden, true);
  }
  const ipad = safari.replace(/\(iPhone[^)]*\)/, "(Macintosh; Intel Mac OS X)");
  assert.equal(load(bridge("email"), 2, { agent: ipad, platform: "MacIntel", touch: 5 }).link.hidden, false);
});
