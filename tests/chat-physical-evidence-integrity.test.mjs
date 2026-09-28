import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { inspectChatPhysicalEvidence } from '../scripts/verify-chat-physical-evidence.mjs';

const matrix = (scenario, file = 'run/endpoint.xml') =>
  `case_id\tfamily\tscenario\tstatus\tobservation\tevidence\nCASE01\trecovery\t${scenario}\tPASS\tFixture only\t${file}\n`;

function bundle(t, files) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'chat-evidence-fixture-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const entries = [];
  for (const [name, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    writeFileSync(path.join(root, name), content);
    entries.push(`${createHash('sha256').update(content).digest('hex')}  ./${name}`);
  }
  writeFileSync(path.join(root, 'MANIFEST.sha256'), `${entries.join('\n')}\n`);
  return root;
}

test('a correct checksum manifest does not conceal missing report attachments', t => {
  const root = bundle(t, {
    'matrix-results.tsv': matrix('video recovery'),
    'run/endpoint.xml': '<node text="Video call active" />',
    'FINAL_EVIDENCE_REPORT.md': 'Answer observation: `run/missing-answer.json`.',
  });
  const result = inspectChatPhysicalEvidence(root);
  assert.equal(result.manifestEntries, 3);
  assert.deepEqual(result.issues, [{ code: 'MISSING_REFERENCE', referencedBy: 'FINAL_EVIDENCE_REPORT.md', file: 'run/missing-answer.json' }]);
});

test('voice recovery cannot silently borrow a retained video-call heading', t => {
  const root = bundle(t, {
    'matrix-results.tsv': matrix('Android absent/returns during voice'),
    'run/endpoint.xml': '<node text="Video call active" /><node text="Voice Call" />',
    'FINAL_EVIDENCE_REPORT.md': '`run/endpoint.xml`',
  });
  const result = inspectChatPhysicalEvidence(root);
  assert.deepEqual(result.issues, [{ code: 'REVIEW_MEDIA_MISMATCH', caseId: 'CASE01', file: 'run/endpoint.xml', plannedMedia: 'voice', observedMedia: 'video' }]);
  assert.equal(result.reportedCounts.PASS, 1, 'report history is never rewritten by the checker');
});

test('menu choices and hidden prior headings do not establish current media identity', t => {
  const root = bundle(t, {
    'matrix-results.tsv': matrix('voice recovery'),
    'run/endpoint.xml': '<node text="Voice call active"/><node text="Video Call"/><node visible="false" text="Video call active"/>',
    'FINAL_EVIDENCE_REPORT.md': '`run/endpoint.xml`',
  });
  assert.deepEqual(inspectChatPhysicalEvidence(root).issues, []);
});

test('a later incoming voice capture attached to a video row requires explicit review', t => {
  const root = bundle(t, {
    'matrix-results.tsv': matrix('video expiry and late Answer', 'run/endpoint.json'),
    'run/endpoint.json': JSON.stringify({ value: '<node visible="true" label="INCOMING VOICE CALL"/>' }),
    'FINAL_EVIDENCE_REPORT.md': '`run/endpoint.json`',
  });
  assert.equal(inspectChatPhysicalEvidence(root).issues[0]?.code, 'REVIEW_MEDIA_MISMATCH');
});

test('altered retained evidence and references outside the bundle are rejected', t => {
  const root = bundle(t, {
    'matrix-results.tsv': matrix('video', '../outside.xml'),
    'run/endpoint.xml': '<node text="Video call active"/>',
    'FINAL_EVIDENCE_REPORT.md': '`run/endpoint.xml`',
  });
  writeFileSync(path.join(root, 'run/endpoint.xml'), '<node text="Voice call active"/>');
  const codes = inspectChatPhysicalEvidence(root).issues.map(issue => issue.code);
  assert.ok(codes.includes('CHECKSUM_MISMATCH'));
  assert.ok(codes.includes('UNSAFE_REFERENCE'));
});
