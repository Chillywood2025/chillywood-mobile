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

const doc = read("docs/release/TARGETED_WATCH_PARTY_REALTIME_MIGRATION_APPLY.md");
const migration = read("supabase/migrations/20260627131501_watch_party_realtime_publication.sql");
const packageJson = read("package.json");

[
  "Targeted Watch-Party realtime migration apply: Closed / Partial / Blocked",
  "Final verdict: Closed",
  "Only `supabase/migrations/20260627131501_watch_party_realtime_publication.sql` was applied",
  "No unrelated pending migrations were applied",
  "Targeted migration path: `supabase/migrations/20260627131501_watch_party_realtime_publication.sql`",
  "watch_party_rooms",
  "watch_party_room_memberships",
  "watch_party_room_messages",
  "watch_party_sync_events",
  "Remote DB Preflight",
  "Targeted Apply Method",
  "Post-Apply Verification",
  "RLS remains enabled on all four target tables",
  "money_%` tables added to realtime publication",
  "Migration version `20260627131501` recorded",
  "No broad `supabase db push` was run",
  "No unrelated pending migrations were applied",
  "No provider mutation happened",
  "liveMoneyEnabled remains OFF",
  "Payouts, cashout, Stripe Connect production, payable balances, withdrawals, transfers, provider refunds, and automatic refunds remain OFF",
  "No passwords, service-role keys, Supabase keys, DB URLs with credentials, LiveKit tokens, push tokens, provider secrets, signed URLs, raw storage paths, raw IPs, private messages, private evidence, tax IDs, bank details, or provider transaction/customer/order records were committed or artifacted",
].forEach((needle) => requireText("targeted migration apply doc", doc, needle));

[
  "alter publication supabase_realtime add table public.\"watch_party_rooms\"",
  "alter publication supabase_realtime add table public.\"watch_party_room_memberships\"",
  "alter publication supabase_realtime add table public.\"watch_party_room_messages\"",
  "alter publication supabase_realtime add table public.\"watch_party_sync_events\"",
].forEach((needle) => requireText("targeted Watch-Party migration", migration, needle));

[
  "proof:targeted-watch-party-realtime-migration-apply",
  "guard:targeted-watch-party-realtime-migration-policy",
].forEach((needle) => requireText("package scripts", packageJson, needle));

if (failures.length) {
  console.error("targeted Watch-Party realtime migration apply proof failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("targeted Watch-Party realtime migration apply proof passed.");
console.log("- targeted migration path, exact publication tables, no unrelated migration apply, post-apply verification, and safety wording are documented.");
