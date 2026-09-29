import { createHash } from 'node:crypto';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Checks retained bytes and references only. This cannot certify timing,
// hardware behavior, source installation, or the truth of a PASS claim.
export function inspectChatPhysicalEvidence(bundleRoot) {
  const root = realpathSync(bundleRoot);
  const issues = [];
  const checkedFiles = new Set();
  const issue = (code, details) => issues.push({ code, ...details });
  const file = (relative, referencedBy) => {
    const normalized = relative.replace(/^\.\//, '');
    const target = path.resolve(root, normalized);
    if (!normalized || path.isAbsolute(normalized) || target === root || !target.startsWith(`${root}${path.sep}`)) {
      issue('UNSAFE_REFERENCE', { referencedBy, file: relative });
      return null;
    }
    if (!existsSync(target)) {
      issue('MISSING_REFERENCE', { referencedBy, file: normalized });
      return null;
    }
    if (!realpathSync(target).startsWith(`${root}${path.sep}`)) {
      issue('UNSAFE_REFERENCE', { referencedBy, file: normalized });
      return null;
    }
    return target;
  };
  const manifest = file('MANIFEST.sha256', 'bundle');
  if (manifest) for (const line of readFileSync(manifest, 'utf8').trim().split(/\r?\n/)) {
    const match = line.match(/^([0-9a-f]{64}) [ *](.+)$/);
    if (!match) { issue('INVALID_MANIFEST_LINE', { referencedBy: 'MANIFEST.sha256' }); continue; }
    const name = match[2].replace(/^\.\//, '');
    if (checkedFiles.has(name)) issue('DUPLICATE_MANIFEST_ENTRY', { file: name });
    checkedFiles.add(name);
    const target = file(name, 'MANIFEST.sha256');
    if (target && createHash('sha256').update(readFileSync(target)).digest('hex') !== match[1]) {
      issue('CHECKSUM_MISMATCH', { file: name });
    }
  }
  const referencedFile = (name, referencedBy) => {
    const target = file(name, referencedBy);
    if (target && !checkedFiles.has(name.replace(/^\.\//, ''))) issue('UNMANIFESTED_REFERENCE', { file: name, referencedBy });
    return target;
  };
  const matrixPath = referencedFile('matrix-results.tsv', 'bundle');
  const cases = [];
  const counts = {};
  if (matrixPath) {
    const [header, ...lines] = readFileSync(matrixPath, 'utf8').trim().split(/\r?\n/);
    const keys = header.split('\t');
    if (!['case_id', 'scenario', 'status', 'evidence'].every(key => keys.includes(key))) {
      issue('INVALID_MATRIX_HEADER', { file: 'matrix-results.tsv' });
    } else for (const line of lines) {
      const row = Object.fromEntries(keys.map((key, index) => [key, line.split('\t')[index] ?? '']));
      if (!row.case_id || cases.includes(row.case_id)) issue('DUPLICATE_OR_EMPTY_CASE', { caseId: row.case_id });
      cases.push(row.case_id);
      counts[row.status] = (counts[row.status] ?? 0) + 1;
      if (!['PASS', 'FAIL', 'AUTOMATION BLOCKED', 'DEPENDENCY BLOCKED', 'NOT RUN'].includes(row.status)) {
        issue('INVALID_STATUS', { caseId: row.case_id, status: row.status });
      }
      const plannedMedia = row.scenario.match(/\b(voice|video)\b/i)?.[1].toLowerCase();
      for (const name of row.evidence.split(';').map(value => value.trim()).filter(value => value && value !== '-')) {
        const target = referencedFile(name, row.case_id);
        if (!target || !plannedMedia || !/\.(xml|json)$/i.test(name)) continue;
        let xml = readFileSync(target, 'utf8');
        if (name.endsWith('.json')) {
          try { xml = JSON.parse(xml).value; } catch { issue('INVALID_JSON', { file: name }); continue; }
          if (typeof xml !== 'string') continue;
        }
        // Inspect exact current-call headings, not menu choices such as "Video Call".
        // A different later call can be intentional; flag for review, never relabel it.
        const observed = new Set();
        for (const tag of xml.matchAll(/<[^>]+>/g)) {
          if (/\bvisible="false"/.test(tag[0])) continue;
          for (const attr of tag[0].matchAll(/\b(?:text|label|value)="([^"]*)"/g)) {
            const heading = attr[1].match(/^(?:(voice|video) call active|incoming (voice|video) call)$/i);
            if (heading) observed.add((heading[1] ?? heading[2]).toLowerCase());
          }
        }
        for (const media of observed) if (media !== plannedMedia) issue('REVIEW_MEDIA_MISMATCH', {
          caseId: row.case_id, file: name, plannedMedia, observedMedia: media,
        });
      }
    }
  }
  const report = referencedFile('FINAL_EVIDENCE_REPORT.md', 'bundle');
  if (report) {
    const references = new Set([...readFileSync(report, 'utf8').matchAll(/`((?:run|pr\d+)\/[^`\n]+\.(?:json|xml|png|mp4|mov|wav))`/g)].map(match => match[1]));
    for (const name of references) referencedFile(name, 'FINAL_EVIDENCE_REPORT.md');
  }
  return { manifestEntries: checkedFiles.size, caseCount: cases.length, reportedCounts: counts, issues,
    limitation: 'Integrity/reference review only; no physical, timing, source, provider or release qualification.' };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const index = process.argv.indexOf('--bundle');
  if (index < 0 || !process.argv[index + 1]) throw new Error('Usage: node scripts/verify-chat-physical-evidence.mjs --bundle <unpacked-directory>');
  const result = inspectChatPhysicalEvidence(process.argv[index + 1]);
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.issues.length ? 1 : 0;
}
