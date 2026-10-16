import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const regression = "tests/communication-received-silence-wait.test.mjs";
const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
const runRegression = (name, { preload, env = process.env } = {}) => {
  const childEnv = { ...env };
  // This is an independent child runner, not a nested test worker.
  delete childEnv.NODE_TEST_CONTEXT;
  return spawnSync(process.execPath, [
    ...(preload ? ["--import", preload] : []),
    "--test", "--test-reporter=tap", `--test-name-pattern=^${escape(name)}$`, regression,
  ], { cwd: root, env: childEnv, encoding: "utf8", timeout: 20_000 });
};
const assertKilled = (result, name, evidence) => {
  assert.equal(result.error, undefined, "control must reach the child test runner");
  assert.equal(result.signal, null, "a crash or timeout is not a killed mutation");
  assert.equal(result.status, 1, `${name}\n${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, new RegExp(`not ok \\d+ - ${escape(name)}`, "u"));
  assert.match(result.stdout, /code: 'ERR_ASSERTION'/u, "failure must be a regression assertion");
  assert.match(result.stdout, evidence, "failure must demonstrate the intended missing protection");
};

test("the former fixed-sleep HTTP source is rejected by the actual gate wiring regression", () => {
  const source = fs.readFileSync(path.join(root, "scripts/test-chilly-chat-real-peer-http.mjs"), "utf8");
  const current = `      await waitForLegacyBrowserReceivedSilence({
        receiver: projected.endpoints.find((endpoint) => endpoint.userId !== userId),
        read: async () => (await read()).endpoints.find((endpoint) => endpoint.userId !== userId),
      });`;
  // Exact former block, reconstructed without a historical Git object so the
  // regression also runs in CI's shallow checkout. It is never executed.
  const former = `      await pause(300);
      const silentStart = (await read()).endpoints.find((endpoint) => endpoint.userId !== userId);
      await pause(300);
      const silentEnd = (await read()).endpoints.find((endpoint) => endpoint.userId !== userId);
      assert.ok(samples(silentEnd) > samples(silentStart) && packets(silentEnd) > packets(silentStart), "mute preserves actual received PCM samples and RTP for the silence measurement");
      assert.ok(energy(silentEnd) - energy(silentStart) < 0.0001, "actual receiver observes muted PCM silence");`;
  assert.equal(source.split(current).length, 2, "control must replace the one real HTTP mute observation");
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "chilly-silence-old-source-"));
  try {
    fs.mkdirSync(path.join(temporaryRoot, "scripts"));
    fs.writeFileSync(path.join(temporaryRoot, "scripts/test-chilly-chat-real-peer-http.mjs"), source.replace(current, former));
    const name = "HTTP mute gate uses the bounded real-input observer and retains six control cycles";
    assertKilled(runRegression(name, { env: { ...process.env, CHILLY_CHAT_SOURCE_ROOT: temporaryRoot } }),
      name, /did not match the regular expression[\s\S]*waitForLegacyBrowserReceivedSilence/u);
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

const mutations = [
  {
    name: "accepting without silence evidence",
    before: "if (inspect(endpoint)) return endpoint;", after: "if (true) return endpoint;",
    regression: "never-silent audio cannot pass before the bounded deadline",
  },
  {
    name: "ignoring the pinned endpoint identity",
    before: 'assert.ok(latest.sameEndpoint, "Received silence endpoint identity changed");',
    after: "/* mutation: ignore endpoint identity */",
    regression: "wrong endpoint cannot substitute for current received silence",
  },
  {
    name: "substituting PCM for the received RTP counter",
    before: "packets: reports[0].packets, sampleRate:", after: "packets: input.pcmSamples, sampleRate:",
    regression: "stalled RTP with continuing silent PCM cannot pass before the bounded deadline",
  },
  {
    name: "accepting a browser read after the deadline",
    before: 'assert.ok(now() < deadline, "Received silence three-second settling deadline expired");',
    after: "/* mutation: ignore delayed read */",
    regression: "otherwise-silent browser read settling after 3001 ms cannot pass",
  },
];
for (const mutation of mutations) {
  test(`negative control kills ${mutation.name}`, () => {
    const helper = path.join(root, "tests/assurance/helpers/legacy-browser-silence-wait.mjs");
    const source = fs.readFileSync(helper, "utf8");
    assert.equal(source.split(mutation.before).length, 2, "mutation must change one real implementation guard");
    // Intercept this helper only in the child process. No tracked source is
    // changed, and the child runs only the named pure regression, never Auth/DB.
    const hook = `export async function load(url, context, nextLoad) {
      const result = await nextLoad(url, context);
      if (url !== ${JSON.stringify(new URL("./assurance/helpers/legacy-browser-silence-wait.mjs", import.meta.url).href)}) return result;
      return { ...result, source: result.source.toString().replace(${JSON.stringify(mutation.before)}, ${JSON.stringify(mutation.after)}) };
    }`;
    const register = `import { register } from 'node:module'; register(${JSON.stringify(`data:text/javascript,${encodeURIComponent(hook)}`)}, import.meta.url);`;
    assertKilled(runRegression(mutation.regression, { preload: `data:text/javascript,${encodeURIComponent(register)}` }),
      mutation.regression, /Missing expected rejection/u);
  });
}
