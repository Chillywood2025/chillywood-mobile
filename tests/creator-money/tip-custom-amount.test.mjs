import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const source = readFileSync("_lib/creatorTipAmount.ts", "utf8");
function load(text = source) {
  const module = { exports: {} };
  new Function("module", "exports", ts.transpileModule(text, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText)(module, module.exports);
  return module.exports;
}
const { parseCreatorTipAmount: parse, formatCreatorTipAmountInput: format } = load();

test("buyer USD decimal input preserves exact cents, including non-tier amounts", () => {
  for (const [text, cents] of [["0.01", 1], ["0.50", 50], ["0.99", 99], ["1", 100],
    ["1.1", 110], ["2.37", 237], ["10.29", 1029], ["500.01", 50001], ["90071992547409.91", Number.MAX_SAFE_INTEGER]]) {
    assert.equal(parse(text), cents, text);
    assert.equal(parse(format(cents)), cents);
  }
});

test("invalid, ambiguous, fractional-cent and overflowing amounts never round or coerce", () => {
  for (const text of ["", " ", "0", "0.00", "-1", "+1", "1e2", "1,00", "1,000.00", "$1.00", ".99", "1.",
    "01", "1.001", "2.999", " 1", "1 ", "Infinity", "NaN", "90071992547409.92", "100000000000000", null, 1]) {
    assert.equal(parse(text), null, String(text));
  }
  for (const cents of [0, -1, 1.5, Infinity, Number.MAX_SAFE_INTEGER + 1]) assert.equal(format(cents), "");
});

test("negative control detects a rounding-based decimal parser", () => {
  const mutant = load(source.replace('return cents > 0n && cents <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(cents) : null;',
    'return Math.round(Number(value) * 100);'));
  assert.notEqual(mutant.parseCreatorTipAmount("90071992547409.92"), null);
});

test("production custom quote normalization binds exact buyer/session/creator/amount/platform", () => {
  const module={exports:{}};
  new Function('module','exports','require',ts.transpileModule(readFileSync('_lib/creatorTipCustomQuote.ts','utf8'),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
  }).outputText)(module,module.exports,()=>({}));
  const normalize=module.exports.normalizeCreatorTipCustomQuote;
  const availability=module.exports.normalizeCreatorTipCustomAvailability;
  const expected={buyerId:'buyer',sessionId:'session',creatorId:'creator',amountCents:51,platform:'ios'};
  const quote={...expected,available:true,feature:'creator_tip',provider:'stripe_connect',currency:'usd',environment:'test',
    paymentMethod:'card',routeKind:'external_browser_checkout',storefrontCountry:'US',capabilityId:'ef000000-0000-4000-8000-000000000001',minAmountMinor:50,maxAmountMinor:100000,
    expiresAt:'2030-01-01T00:00:00Z',eligibilityExpiresAt:'2030-01-01T00:00:00Z',noAccessGranted:true,liveMoneyAction:false};
  assert.equal(normalize(quote,expected,0).amountCents,51);
  assert.equal(normalize({...quote,platform:'web'},{...expected,platform:'web'},0).amountCents,51);
  assert.equal(normalize({...quote,platform:'web',storefrontCountry:'CA'},{...expected,platform:'web'},0),null);
  const below={...quote,available:false,amountCents:49,reason:'amount_below_provider_minimum'};
  assert.match(availability(below,{...expected,amountCents:49},0).message,/\$0\.50 USD/);
  assert.equal(availability({...below,buyerId:'other'},{...expected,amountCents:49},0).message,'');
  assert.equal(availability({...below,reason:'approved_route_unavailable'},{...expected,amountCents:49},0).message,'');
  assert.equal(availability(below,{...expected,amountCents:49},0).quote,null);
  for(const change of [{available:false},{buyerId:'other'},{sessionId:'old'},{creatorId:'other'},{amountCents:38},
    {platform:'android'},{storefrontCountry:'CA'},{routeKind:undefined},{currency:'eur'},{environment:'live'},{paymentMethod:'bank_transfer'},{minAmountMinor:52},
    {maxAmountMinor:36},{expiresAt:'invalid'},{expiresAt:'1970-01-01T00:00:00Z'},{eligibilityExpiresAt:'1970-01-01T00:00:00Z'},{capabilityId:'bad'},
    {noAccessGranted:false},{liveMoneyAction:true},{feature:'event_auction'},{provider:'revenuecat'}]) {
    assert.equal(normalize({...quote,...change},expected,0),null,JSON.stringify(change));
  }
});
