// Actual source worker + actual local SQL. Provider API/keys/qualification below
// are deterministic synthetic fixtures, not RevenueCat or deployment evidence.
import assert from 'node:assert/strict';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { V2_FIXTURE, v2Connection, createV2CommandApi, BUYER, BUYER_SESSION, sqlText, sqlJson, syntheticHash } from './test-store-v2.fixture.mjs';

export function providerSources(repo) {
  return [path.join(repo, 'supabase/functions/_shared/isolated-test-store-v2-provisioner.ts'),
    path.join(repo, 'isolated-runtime/sandbox-commerce-v1/tests/test-store-v2-provider.fixture.mjs')];
}
export function createV2ProviderFixture(q, repo, load) {
  const source = load(path.join(repo, 'supabase/functions/_shared/isolated-test-store-v2-provisioner.ts'));
  const connection = v2Connection(), service = 'synthetic-v2-internal-service-credential-only';
  const config = { enabled: true, qualification: 'qualified', connectionId: connection.connectionId, connectionRevision: 1,
    projectId: connection.projectId, appId: connection.appId, providerConfigurationDigest: connection.providerConfigurationDigest,
    qualificationEvidenceSha256: syntheticHash('v2-provisioning'), credentialRef: V2_FIXTURE.credentialRef,
    credentialVersion: V2_FIXTURE.credentialVersion, secret: 'synthetic-provider-api-credential-not-real',
    encryption: connection.encryption,
    limits: { timeoutMs: 5000, maxResponseBytes: 262144, pageSize: 100, maxPages: 10, maxItems: 1000 } };
  const prefix = `set role service_role;set request.jwt.claims='{"role":"service_role"}';`;
  const states = new Map(), tickets = new Map(), faults = new Map(), calls = [], recorded = [], claims = [];
  const response = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  const product = () => ({ object: 'product', id: V2_FIXTURE.providerProductId, store_identifier: V2_FIXTURE.productId,
    app_id: connection.appId, state: 'active', type: 'consumable', one_time: null });
  const stateFor = ticket => {
    let state = states.get(ticket.planId);
    if (!state) {
      state = { planId: ticket.planId, plan: structuredClone(ticket.plan), offering: null, package: null, attached: false,
        offeringId: 'ofrng_' + ticket.planId.replaceAll('-', ''), packageId: 'pk_' + ticket.planId.replaceAll('-', ''), postCounts: {} };
      states.set(ticket.planId, state);
    }
    assert.equal(state.plan.offeringLookupKey, ticket.plan.offeringLookupKey);
    assert.equal(state.plan.packageLookupKey, ticket.plan.packageLookupKey);
    assert.equal(state.plan.providerProductId, ticket.plan.providerProductId);
    return state;
  };
  const rpc = (name, args) => {
    const values = Object.values(args).map(value => typeof value === 'object' && value !== null ? sqlJson(value) : value === null ? 'null' : sqlText(value));
    assert.ok(['isolated_test_store_v2_provisioning_next_v1', 'isolated_test_store_v2_provisioning_claim_v1',
      'isolated_test_store_v2_provisioning_record_v1', 'isolated_test_store_v2_provisioning_plan_v1'].includes(name));
    return JSON.parse(q(prefix + `select public.${name}(${values.join(',')});`));
  };
  const next = planId => rpc('isolated_test_store_v2_provisioning_next_v1', { p_plan_id: planId });
  const identify = (url, init) => {
    assert.equal(url.origin, 'https://api.revenuecat.com');
    assert.equal(init.redirect, 'error'); assert.ok(init.signal instanceof AbortSignal);
    assert.equal(init.headers.authorization, `Bearer ${config.secret}`);
    const parts = url.pathname.split('/').filter(Boolean), body = init.body ? JSON.parse(init.body) : null;
    assert.deepEqual(parts.slice(0, 3), ['v2', 'projects', connection.projectId]);
    let state, operation;
    if (parts[3] === 'offerings') {
      if (parts.length === 4) {
        operation = init.method === 'POST' ? 'create_offering' : 'list_offerings';
        if (body) state = [...states.values()].find(s => s.plan.offeringLookupKey === body.lookup_key);
      } else {
        state = [...states.values()].find(s => s.offeringId === parts[4]);
        operation = parts.length === 5 ? 'read_offering' : init.method === 'POST' ? 'create_package' : 'list_packages';
        if (parts.length === 6) assert.equal(parts[5], 'packages');
      }
    } else if (parts[3] === 'packages') {
      state = [...states.values()].find(s => s.packageId === parts[4]);
      operation = parts.length === 5 ? 'read_package' : parts[5] === 'products' ? 'list_package_products' : 'attach_product';
      if (operation === 'attach_product') assert.deepEqual(parts.slice(5), ['actions', 'attach_products']);
    } else if (parts[3] === 'products') {
      assert.equal(parts[4], V2_FIXTURE.providerProductId); assert.equal(parts.length, 5); operation = 'read_product';
    } else assert.fail('Unsupported synthetic provider route: ' + url.pathname);
    assert.equal(init.method, operation.startsWith('create_') || operation === 'attach_product' ? 'POST' : 'GET');
    return { operation, state, body };
  };
  const list = (url, entries) => {
    assert.equal(url.searchParams.get('limit'), '100');
    const sorted = [...entries].sort((a, b) => (a.id ?? a.product.id).localeCompare(b.id ?? b.product.id));
    const cursor = url.searchParams.get('starting_after');
    const index = cursor === null ? 0 : sorted.findIndex(e => (e.id ?? e.product.id) === cursor) + 1;
    assert.ok(cursor === null || index > 0, 'Synthetic provider received an unknown pagination cursor');
    const items = sorted.slice(index, index + 100);
    const body = { object: 'list', url: url.href, items };
    if (index + items.length < sorted.length) {
      const continuation = new URL(url); continuation.searchParams.set('starting_after', items.at(-1).id ?? items.at(-1).product.id);
      body.next_page = continuation.href;
    }
    return body;
  };
  const deps = {
    next: async planId => next(planId),
    claim: async selector => {
      const result = rpc('isolated_test_store_v2_provisioning_claim_v1', { p_plan_id: selector.planId,
        p_operation: selector.operation, p_request_id: selector.requestId, p_cursor: selector.cursor });
      claims.push({ selector: structuredClone(selector), result: structuredClone(result) });
      if (result.status === 'send_permit_consumed') { tickets.set(result.ticket.ticketId, result.ticket); stateFor(result.ticket); }
      return result;
    },
    record: async record => {
      const ticket = tickets.get(record.ticketId); assert.ok(ticket, 'No source-issued consumed ticket for record');
      // Exercise actual source decryption/reparse before the real SQL boundary.
      await source.decryptProvisioningEvidence(record.evidence, record.observation, ticket, config);
      const result = rpc('isolated_test_store_v2_provisioning_record_v1', { p_ticket_id: record.ticketId,
        p_evidence: record.evidence, p_observation: record.observation });
      recorded.push({ ...structuredClone(record), result: structuredClone(result) });
      const key = `${ticket.planId}:${ticket.operation}`;
      if (faults.get(key) === 'storage_ack_lost') { faults.delete(key); throw Error('synthetic durable SQL acknowledgement lost'); }
      return result;
    },
    fetch: async (input, init) => {
      const url = new URL(input), { operation, state, body } = identify(url, init);
      calls.push({ operation, planId: state?.planId ?? null, url: input, method: init.method, body });
      let output, status = 200;
      if (operation === 'create_offering') {
        assert.ok(state); state.postCounts[operation] = (state.postCounts[operation] ?? 0) + 1;
        assert.equal(state.postCounts[operation], 1, 'Consumed Offering POST was resent');
        assert.deepEqual(body, { display_name: state.plan.offeringDisplayName, lookup_key: state.plan.offeringLookupKey });
        assert.equal(state.offering, null);
        state.offering = { object: 'offering', id: state.offeringId, lookup_key: state.plan.offeringLookupKey,
          display_name: state.plan.offeringDisplayName, project_id: connection.projectId, state: 'active', is_current: false, created_at: Date.now() };
        output = state.offering; status = 201;
      } else if (operation === 'create_package') {
        assert.ok(state?.offering); state.postCounts[operation] = (state.postCounts[operation] ?? 0) + 1;
        assert.equal(state.postCounts[operation], 1, 'Consumed Package POST was resent'); assert.equal(state.package, null);
        assert.deepEqual(body, { display_name: state.plan.packageDisplayName, lookup_key: state.plan.packageLookupKey });
        state.package = { object: 'package', id: state.packageId, lookup_key: state.plan.packageLookupKey,
          display_name: state.plan.packageDisplayName, position: 1, created_at: Date.now() };
        output = state.package; status = 201;
      } else if (operation === 'attach_product') {
        assert.ok(state?.package); state.postCounts[operation] = (state.postCounts[operation] ?? 0) + 1;
        assert.equal(state.postCounts[operation], 1, 'Consumed attachment POST was resent'); assert.equal(state.attached, false);
        assert.deepEqual(body, { products: [{ eligibility_criteria: 'all', product_id: V2_FIXTURE.providerProductId }] });
        state.attached = true; output = state.package;
      } else if (operation === 'list_offerings') output = list(url, [...states.values()].flatMap(s => s.offering ? [s.offering] : []));
      else if (operation === 'read_offering') { assert.ok(state?.offering); output = state.offering; }
      else if (operation === 'read_package') { assert.ok(state?.package); output = state.package; }
      else if (operation === 'list_packages') { assert.ok(state?.offering); output = list(url, state.package ? [state.package] : []); }
      else if (operation === 'list_package_products') { assert.ok(state?.package); output = list(url, state.attached ? [{ product: product(), eligibility_criteria: 'all' }] : []); }
      else if (operation === 'read_product') output = product();
      else assert.fail('Unknown synthetic operation');
      const key = state ? `${state.planId}:${operation}` : null;
      if (key && faults.get(key) === 'response_lost') { faults.delete(key); throw Error('synthetic provider committed but response was lost'); }
      return response(output, status);
    },
  };
  const handler = source.createProvisioningWorker(() => config, () => service, deps);
  const runWorker = async planId => {
    const http = await handler(new Request('https://synthetic.invalid/internal-worker', { method: 'POST',
      headers: { authorization: `Bearer ${service}` }, body: JSON.stringify({ protocol: 'isolated-test-store-v2-provision-worker', planId }) }));
    return { httpStatus: http.status, result: await http.json() };
  };
  const runStep = (planId, operation, cursor = null, requestId = randomUUID()) =>
    source.runProvisioningStep({ planId, operation, cursor, requestId }, config, deps);
  const planFor = (allocation, buyerId = BUYER) => {
    const input = allocation.allocation ?? allocation;
    assert.match(input.intentId, /^scv1_intent_[a-f0-9-]{36}$/u);
    const result = rpc('isolated_test_store_v2_provisioning_plan_v1', { p_buyer_id: buyerId, p_intent_id: input.intentId.slice('scv1_intent_'.length) });
    assert.match(result.planId, /^[a-f0-9-]{36}$/u); return result.planId;
  };
  const registerPlan = async (allocation, actor = { userId: BUYER, sessionId: BUYER_SESSION }) => {
    const input = allocation.allocation ?? allocation, planId = planFor(input, actor.userId), passes = [];
    for (let attempt = 0; attempt < 4; attempt++) {
      const pass = await runWorker(planId); passes.push(pass);
      assert.ok(['registered', 'waiting'].includes(pass.result.status), JSON.stringify({ pass, lastClaim: claims.at(-1), lastRecorded: recorded.at(-1) }));
      if (pass.result.status === 'registered') break;
      // Only continue a bounded eight-step pass. A waiting lease, unknown
      // response, or rate refusal is deliberately not retried by this helper.
      assert.equal(pass.result.steps, 8, 'Clean fixture unexpectedly stopped before the finite step cap');
    }
    assert.equal(passes.at(-1).result.status, 'registered', 'Actual worker did not register through readbacks');
    const response = createV2CommandApi(q).call('read', { intentId: input.intentId }, randomUUID(), actor);
    assert.equal(response.result.status, 'offering_ready'); assert.equal(response.result.dispatchAllowed, false);
    const registration = response.result.allocation.registration; assert.ok(registration);
    const evidence = JSON.parse(q(`select jsonb_build_object(
      'offering',jsonb_build_object('ticketId',r.offering_evidence,'operation',ot.operation,'evidence',oe.evidence,'observation',oe.observation),
      'package',jsonb_build_object('ticketId',r.package_evidence,'operation',pt.operation,'evidence',pe.evidence,'observation',pe.observation),
      'attachment',jsonb_build_object('ticketId',r.attachment_evidence,'operation',at.operation,'evidence',ae.evidence,'observation',ae.observation),
      'product',jsonb_build_object('ticketId',r.product_evidence,'operation',rt.operation,'evidence',re.evidence,'observation',re.observation))
      from sandbox_commerce_v1.test_store_v2_registrations r
      join sandbox_commerce_v1.test_store_v2_tickets ot on ot.id=r.offering_evidence join sandbox_commerce_v1.test_store_v2_transport_evidence oe on oe.ticket_id=ot.id
      join sandbox_commerce_v1.test_store_v2_tickets pt on pt.id=r.package_evidence join sandbox_commerce_v1.test_store_v2_transport_evidence pe on pe.ticket_id=pt.id
      join sandbox_commerce_v1.test_store_v2_tickets at on at.id=r.attachment_evidence join sandbox_commerce_v1.test_store_v2_transport_evidence ae on ae.ticket_id=at.id
      join sandbox_commerce_v1.test_store_v2_tickets rt on rt.id=r.product_evidence join sandbox_commerce_v1.test_store_v2_transport_evidence re on re.ticket_id=rt.id
      where r.plan_id=${sqlText(planId)};`));
    assert.deepEqual(Object.values(evidence).map(e => e.operation).sort(), ['list_package_products', 'list_packages', 'read_offering', 'read_product']);
    assert.equal(new Set(Object.values(evidence).map(e => e.ticketId)).size, 4);
    for (const e of Object.values(evidence)) {
      assert.ok(['resource', 'list'].includes(e.observation.kind)); assert.equal(e.observation.complete, true);
      assert.ok(await source.decryptProvisioningEvidence(e.evidence, e.observation, tickets.get(e.ticketId), config));
    }
    return { planId, response, registration, evidence, passes };
  };
  return { source, config, deps, states, tickets, calls, recorded, claims, next, runWorker, runStep, planFor, registerPlan,
    setFault(planId, operation, fault) { assert.ok(['response_lost', 'storage_ack_lost'].includes(fault)); faults.set(`${planId}:${operation}`, fault); },
    reset() { states.clear(); tickets.clear(); calls.length = 0; recorded.length = 0; claims.length = 0; faults.clear(); },
  };
}
