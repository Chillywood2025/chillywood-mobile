#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];

const read = (relativePath) => {
  const absolute = path.join(root, relativePath);
  if (!fs.existsSync(absolute)) {
    failures.push(`Missing required file: ${relativePath}`);
    return "";
  }
  return fs.readFileSync(absolute, "utf8");
};

const requireText = (label, content, needle) => {
  if (!content.includes(needle)) failures.push(`${label} missing required text: ${needle}`);
};

const doc = read("docs/release/WATCH_PARTY_REALTIME_CALLBACK_FIX.md");
const packageJson = read("package.json");
const migration = read("supabase/migrations/20260627131501_watch_party_realtime_publication.sql");

[
  "Watch-Party realtime callback fix: Closed / Partial / Blocked",
  "Previous partial result",
  "Root cause classification: realtime publication/config issue",
  "watch_party_sync_events",
  "watch_party_sync_events callback observed / not observed",
  "Playback readback matched / did not match",
  "Callback observed",
  "Playback readback matched",
  "Latest focused artifact: `/tmp/app-watch-party-realtime-callback-fix-20260627142209/`",
  "This is called Closed because callback proof and playback readback both passed.",
  "The targeted migration was applied in `docs/release/TARGETED_WATCH_PARTY_REALTIME_MIGRATION_APPLY.md` without running a broad `supabase db push` and without applying unrelated pending migrations.",
  "Two active Play-internal v57 Android clients are required for full installed-app realtime UI proof",
  "Diagnostic sideloaded emulator is not accepted as Play-internal UI proof",
  "No sideload was used on the physical tester phone",
  "No Play production submission happened",
  "No provider mutation happened",
  "liveMoneyEnabled remains OFF",
  "Payouts, cashout, Stripe Connect production, payable balances, withdrawals, transfers, provider refunds, and automatic refunds remain OFF",
].forEach((needle) => requireText("Watch-Party callback fix doc", doc, needle));

[
  "alter publication supabase_realtime add table public.\"watch_party_rooms\"",
  "alter publication supabase_realtime add table public.\"watch_party_room_memberships\"",
  "alter publication supabase_realtime add table public.\"watch_party_room_messages\"",
  "alter publication supabase_realtime add table public.\"watch_party_sync_events\"",
].forEach((needle) => requireText("Watch-Party realtime publication migration", migration, needle));

[
  "local-run:watch-party-realtime-callback-proof",
  "proof:watch-party-realtime-callback-fix",
  "guard:watch-party-realtime-callback-policy",
].forEach((needle) => requireText("package scripts", packageJson, needle));

if (failures.length) {
  console.error("Watch-Party realtime callback fix proof failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Watch-Party realtime callback fix proof passed.");
console.log("- callback root cause, targeted migration apply, observed callback rerun result, safety wording, and remaining two-phone UI action are documented.");
