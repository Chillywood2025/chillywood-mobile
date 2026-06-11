import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) => readFileSync(path.join(root, relativePath), "utf8");
const fail = (message) => {
  console.error(`Auth email branding policy guard failed: ${message}`);
  process.exit(1);
};

const templateDir = "docs/auth-email-templates";
const requiredTemplates = [
  "confirm-signup.html",
  "confirm-signup.txt",
  "reset-password.html",
  "reset-password.txt",
  "magic-link.html",
  "magic-link.txt",
  "invite-user.html",
  "invite-user.txt",
  "email-change.html",
  "email-change.txt",
  "reauthentication.html",
  "reauthentication.txt",
  "SUBJECTS.md",
  "README.md",
];

for (const file of requiredTemplates) {
  const relativePath = `${templateDir}/${file}`;
  if (!existsSync(path.join(root, relativePath))) fail(`missing ${relativePath}`);
}

for (const file of requiredTemplates.filter((file) => file.endsWith(".html") || file.endsWith(".txt"))) {
  const relativePath = `${templateDir}/${file}`;
  const contents = read(relativePath);
  const hasBrandingWithY = /Chi['\u2019]lywood/.test(contents);
  if (!hasBrandingWithY) fail(`${relativePath} must use Chi’llywood branding`);
  if (!contents.includes("support@chillywoodstream.com")) fail(`${relativePath} must include support contact`);
  if (/\bSupabase\b/u.test(contents)) fail(`${relativePath} must not show provider branding in user-facing copy`);
  if (/password\s*[:=]|smtp|service_role|secret|api[_-]?key/i.test(contents)) {
    fail(`${relativePath} contains secret-like operational copy`);
  }
  if (file !== "reauthentication.html" && file !== "reauthentication.txt" && !contents.includes("{{ .ConfirmationURL }}")) {
    fail(`${relativePath} must use {{ .ConfirmationURL }}`);
  }
}

const signup = read("app/(auth)/signup.tsx");
const SIGNUP_REDIRECT_OK = [
  "chillywoodmobile://auth/confirm",
  "chillywoodmobile://auth/callback",
].some((token) => signup.includes(token));
if (!SIGNUP_REDIRECT_OK) {
  fail("signup must pass a Chi’llwood confirm redirect");
}
if (!signup.includes("emailRedirectTo")) {
  fail("signup must use emailRedirectTo");
}

const login = read("app/(auth)/login.tsx");
const forgotPassword = read("app/(auth)/forgot-password.tsx");
if (!login.includes("/forgot-password")) {
  fail("login must route forgot password to the dedicated reset request screen");
}
if (!forgotPassword.includes("resetPasswordForEmail")) {
  fail("forgot password must use resetPasswordForEmail");
}
if (!forgotPassword.includes("chillywoodmobile://reset-password")) {
  fail("forgot password must pass reset-password redirect");
}

const layout = read("app/_layout.tsx");
for (const requiredRoute of ["/reset-password", "/auth-callback", "/confirm", "/callback"]) {
  if (!layout.includes(requiredRoute)) fail(`root layout must handle ${requiredRoute}`);
}

const runbook = read("docs/SUPABASE_AUTH_EMAIL_BRANDING_RUNBOOK.md");
for (const requiredText of [
  "no-reply@chillywoodstream.com",
  "auth@chillywoodstream.com",
  "chillywoodmobile://auth/confirm",
  "chillywoodmobile://auth/callback",
  "chillywoodmobile://reset-password",
  "Do not commit",
]) {
  if (!runbook.includes(requiredText)) fail(`runbook missing ${requiredText}`);
}

console.log("Auth email branding policy guard passed.");
