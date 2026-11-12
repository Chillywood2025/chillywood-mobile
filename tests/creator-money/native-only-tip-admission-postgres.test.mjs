import test from 'node:test';
import {runNativeTipCutoffProof} from './native-only-tip-admission-fixture.mjs';

test('Native-only cutoff preserves historical Stripe recovery and rolls back new admission', {timeout:1_200_000}, async t=>{
  await runNativeTipCutoffProof({diagnostic:message=>t.diagnostic(message)});
});
