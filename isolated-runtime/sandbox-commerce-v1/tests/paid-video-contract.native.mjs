#!/usr/bin/env node
// Validate the public machine schema against actual SQL captures, not mocks.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
const require = createRequire(import.meta.url), Ajv = require('ajv');
assert.equal(process.argv.length, 4); assert.equal(process.argv[2], '--proof'); assert.ok(path.isAbsolute(process.argv[3]));
const proof = JSON.parse(fs.readFileSync(process.argv[3], 'utf8')); assert.equal(proof.status, 'passed');
const schemaFile = new URL('../paid-video-contract-v1.json', import.meta.url), schemaText = fs.readFileSync(schemaFile, 'utf8'), schema = JSON.parse(schemaText);
const ajv = new Ajv({ allErrors: true }); ajv.addSchema(schema, 'paid-video');
const validateResponse = ajv.getSchema('paid-video'), validateRequest = ajv.compile({ $ref: 'paid-video#/definitions/request' });
assert.ok(proof.contractCaptures.length >= 15);
for (const item of proof.contractCaptures) {
  assert.ok(validateResponse(item.response), JSON.stringify(validateResponse.errors));
  const request = { p_command: item.command, p_payload: item.payload,
    p_expected_account_id: item.response.actor.accountId, p_expected_session_generation: item.response.actor.sessionGeneration };
  assert.ok(validateRequest(request), JSON.stringify(validateRequest.errors));
  assert.equal(validateResponse({ ...item.response, ready: true }), false);
  assert.equal(validateRequest({ ...request, p_payload: { ...request.p_payload, signedUrl: 'https://fixture.invalid' } }), false);
}
process.stdout.write(JSON.stringify({ status: 'passed', actualSqlCaptures: proof.contractCaptures.length,
  contractSha256: createHash('sha256').update(schemaText).digest('hex'),
  scope: 'Exact public request/response shape from real SQL captures; extra authority or URL fields reject. Not app or provider qualification.' }, null, 2) + '\n');
