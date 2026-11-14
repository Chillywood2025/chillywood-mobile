#!/usr/bin/env node
// Offline review inventory, not a tax engine, provider qualification or admission gate.
import { openSync, fstatSync, readSync, closeSync, constants } from 'node:fs';
import { Buffer } from 'node:buffer';
import { pathToFileURL } from 'node:url';

export const jurisdictions = Object.freeze('AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split(' '));
const tracks = ['sales_tax', 'creator_reporting'];
const factKeys = ['entity_and_operating_locations', 'historical_sales_and_registrations', 'product_rights_and_bundles', 'settlement_and_reporting_roles'];
const blank = () => ({ status: 'unreviewed', reviewer: null, evidenceRef: null, reviewedOn: null, reviewBy: null });
const exactKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
function fail() { throw new Error('invalid_compliance_register'); }
function date(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) fail();
  const time = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== value) fail();
  return time;
}
export function createRegister() {
  return {
    schemaVersion: 1,
    facts: Object.fromEntries(factKeys.map((key) => [key, blank()])),
    jurisdictions: jurisdictions.map((state) => ({ state, ...Object.fromEntries(tracks.map((track) => [track, blank()])) })),
  };
}
function reviewState(record, today) {
  if (!exactKeys(record, ['status', 'reviewer', 'evidenceRef', 'reviewedOn', 'reviewBy'])) fail();
  if (record.status === 'unreviewed') {
    if (['reviewer', 'evidenceRef', 'reviewedOn', 'reviewBy'].some((key) => record[key] !== null)) fail();
    return 'unreviewed';
  }
  if (record.status !== 'reviewed') fail();
  // Opaque references only: no names, addresses, tax IDs, provider payloads or URLs.
  if (![record.reviewer, record.evidenceRef].every((v) => typeof v === 'string' && /^[a-zA-Z][a-zA-Z0-9_-]{2,79}$/.test(v))) fail();
  const reviewed = date(record.reviewedOn), deadline = date(record.reviewBy);
  if (reviewed > today || deadline < reviewed) fail();
  if (deadline <= today) return 'review_due';
  if (deadline - today <= 30 * 86400000) return 'review_due_soon';
  return 'review_recorded';
}
export function summarizeCompliance(register, asOf) {
  const today = date(asOf);
  if (!exactKeys(register, ['schemaVersion', 'facts', 'jurisdictions']) || register.schemaVersion !== 1
    || !exactKeys(register.facts, factKeys) || !Array.isArray(register.jurisdictions)
    || register.jurisdictions.length !== jurisdictions.length) fail();
  const seen = new Set(), actions = [], counts = { unreviewed: 0, review_due: 0, review_due_soon: 0, review_recorded: 0 };
  function add(scope, track, record) {
    const status = reviewState(record, today);
    counts[status]++;
    // Do not echo operator references or other input content in the public summary.
    if (status !== 'review_recorded') actions.push({ scope, track, status });
  }
  for (const key of factKeys) add('business', key, register.facts[key]);
  for (const row of register.jurisdictions) {
    if (!exactKeys(row, ['state', ...tracks]) || !jurisdictions.includes(row.state) || seen.has(row.state)) fail();
    seen.add(row.state);
    for (const track of tracks) add(row.state, track, row[track]);
  }
  const rank = { review_due: 0, unreviewed: 1, review_due_soon: 2 };
  actions.sort((a, b) => rank[a.status] - rank[b.status] || a.scope.localeCompare(b.scope) || a.track.localeCompare(b.track));
  return { schemaVersion: 1, asOf, jurisdictionCount: seen.size, counts, actions,
    activationAuthority: false, legalClearance: false,
    limitation: 'Recorded reviews are inventory only. Validate actual scope, legal conclusions, registrations, filings and provider evidence through existing authorized processes.' };
}
export function run(args) {
  if (args.length === 1 && args[0] === '--template') return createRegister();
  if (args.length !== 4 || args[0] !== '--input' || args[2] !== '--as-of') throw new Error('usage: --template OR --input PRIVATE_JSON --as-of YYYY-MM-DD');
  // Bound local input before parsing. Never use environment credentials or network access.
  const limit = 128 * 1024;
  const fd = openSync(args[1], constants.O_RDONLY | constants.O_NONBLOCK);
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size > limit) fail();
    const buffer = Buffer.alloc(limit + 1);
    let size = 0;
    while (size < buffer.length) {
      const bytes = readSync(fd, buffer, size, buffer.length - size, null);
      if (bytes === 0) break;
      size += bytes;
    }
    if (size > limit) fail();
    return summarizeCompliance(JSON.parse(buffer.subarray(0, size).toString('utf8')), args[3]);
  } finally { closeSync(fd); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { process.stdout.write(`${JSON.stringify(run(process.argv.slice(2)), null, 2)}\n`); }
  catch { process.stderr.write('Compliance review unavailable: invalid arguments or register. No readiness conclusion.\n'); process.exitCode = 1; }
}
