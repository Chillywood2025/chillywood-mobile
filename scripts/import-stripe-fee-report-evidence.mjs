#!/usr/bin/env node
// Read-only provider import. Writes a new local evidence artifact, never a ledger.
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { observeStripeFeeReport } from '../supabase/functions/_shared/stripe-fee-report-evidence.ts';

if (process.argv.length !== 4 || process.argv.includes('--help')) {
  console.log('Usage: node scripts/import-stripe-fee-report-evidence.mjs <trusted-context.json> <new-private-output.json>');
  console.log('Requires Node 22.18+ and matching STRIPE_FEE_REPORT_TEST_KEY or STRIPE_FEE_REPORT_LIVE_KEY. Explicit context mode; GET-only; no report creation, ledger writes or payout authority.');
  process.exitCode = process.argv.includes('--help') ? 0 : 1;
} else {
  try {
    const contextBytes = await readFile(resolve(process.argv[2]));
    if (contextBytes.length > 100_000) throw new Error('context_too_large');
    const context = JSON.parse(contextBytes.toString('utf8'));
    if (!['test','live'].includes(context.environment)) throw new Error('mode_required');
    const evidence = await observeStripeFeeReport(context, process.env[`STRIPE_FEE_REPORT_${context.environment.toUpperCase()}_KEY`] ?? '');
    // Never overwrite a prior observation. No credentials, report download URL,
    // raw CSV or unrelated customer/order data is included in the artifact.
    await writeFile(resolve(process.argv[3]), `${JSON.stringify(evidence, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
    console.log('Imported observed-only fee evidence. Settlement remains blocked. Keep the artifact private and out of Git.');
  } catch {
    // Provider/error responses can contain sensitive data; do not echo them.
    console.error('Fee evidence import failed. No ledger or provider state was changed. Check the trusted context, mode-bound credential, completed report and new output path.');
    process.exitCode = 1;
  }
}
