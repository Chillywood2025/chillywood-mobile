import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const login = readFileSync(new URL("../app/(auth)/login.tsx", import.meta.url), "utf8");
const brandedSurface = readFileSync(new URL("../components/ui/chillywood-branded-surface.tsx", import.meta.url), "utf8");

test("Sign In preserves the existing auth and navigation contract", () => {
  assert.equal(login.match(/supabase\.auth\.signInWithPassword/g)?.length, 1);
  assert.match(login, /signInLatchRef\.current\.tryAcquire\(\)/);
  assert.match(login, /signInLatchRef\.current\.release\(\)/);
  assert.match(login, /setLoading\(true\)/);
  assert.match(login, /setLoading\(false\)/);
  assert.match(login, /completePendingSignupProfile/);
  assert.match(login, /trackEvent\("auth_sign_in_success"/);
  assert.match(login, /trackEvent\("auth_sign_in_failure"/);
  assert.match(login, /router\.push\(`\/forgot-password\?\$\{query\.toString\(\)\}` as Href\)/);
  assert.match(login, /pathname: "\/\(auth\)\/signup"/);
  assert.match(login, /redirectId/);
});

test("Sign In keeps the real controls accessible, keyboard-safe, and automation-stable", () => {
  for (const marker of [
    'testID="auth-login-email-input"',
    'testID="auth-login-password-input"',
    'testID="auth-login-submit-button"',
    'testID="login-forgot-password-button"',
    'accessibilityLabel="Login email"',
    'accessibilityLabel="Login password"',
    'accessibilityLabel="Log in"',
    'accessibilityState={{ busy: loading, disabled: loading }}',
    'behavior={Platform.OS === "ios" ? "padding" : "height"}',
    'keyboardShouldPersistTaps="handled"',
    'keyboardDismissMode="on-drag"',
    'secureTextEntry',
    'returnKeyType="done"',
    'void signIn()',
  ]) assert.ok(login.includes(marker), `missing preserved Sign In contract: ${marker}`);
});

test("Sign In reserves a responsive unobstructed Chi'llywood branding zone", () => {
  assert.match(brandedSurface, /assets\/images\/chicago-skyline\.jpg/);
  assert.match(brandedSurface, /useWindowDimensions\(\)/);
  assert.match(brandedSurface, /Math\.max\(170, Math\.min\(height \* 0\.28, 280\)\)/);
  assert.match(login, /testID="auth-login-branding-clearance"/);
  assert.match(brandedSurface, /accessibilityLabel="Chi'llywood\. Stream the City\."/);
  assert.ok(
    login.indexOf('testID="auth-login-branding-clearance"') < login.indexOf('testID="auth-login-glass-panel"'),
    "branding clearance must render before the Sign In card",
  );
  assert.match(brandedSurface, /maxWidth: 560/);
  assert.match(login, /flexGrow: 1/);
  assert.doesNotMatch(login, /position:\s*"absolute"[^}]+top:\s*\d+/s);
});

test("Sign In uses the approved Chicago-night glass and neon presentation", () => {
  for (const marker of [
    'glassBackground: "rgba(7,5,27,0.91)"',
    'glassBorder: "rgba(132,40,255,0.88)"',
    'assets/images/chicago-skyline.jpg',
  ]) assert.ok(brandedSurface.includes(marker), `missing approved shared Sign In presentation marker: ${marker}`);
  for (const marker of [
    'testID="auth-login-branded-surface"',
    'testID="auth-login-glass-panel"',
    'stopColor="#7300D8"',
    'stopColor="#321CFF"',
    'stopColor="#00A8FF"',
    '<Text style={styles.kicker}>WELCOME BACK</Text>',
    '<Text style={styles.titleLight}>Sign </Text>',
    '<Text style={styles.titleAccent}>In</Text>',
    "Access your account, join rooms, and keep up with your favorite creators.",
  ]) assert.ok(login.includes(marker), `missing approved Sign In presentation marker: ${marker}`);
});
