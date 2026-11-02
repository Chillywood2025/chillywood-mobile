import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const harness = fileURLToPath(new URL('../scripts/qualify-clip-render-workloads.py', import.meta.url));
const wrapper = fileURLToPath(new URL('../scripts/lib/clip-workload-media-wrapper.py', import.meta.url));
const common = `import importlib.util,json,sys\nsys.dont_write_bytecode=True\nspec=importlib.util.spec_from_file_location('h',${JSON.stringify(harness)})\nh=importlib.util.module_from_spec(spec);spec.loader.exec_module(h)\n`;

test('workload tiers preserve product maxima and generate valid media rather than fake file padding', () => {
  const result = JSON.parse(execFileSync('python3', ['-c', common + `plans={}
for name,spec in h.TIERS.items():
 p=h.make_plan(name,spec['minimum']);p['commands']=[h.generator_args(f,h.Path('/synthetic.mp4')) for f in p['fixtures']];plans[name]=p
print(json.dumps(plans))`], { encoding: 'utf8' }));
  assert.equal(result.representative.fixtures[0].seconds, 600);
  assert.equal(result.representative.fixtures[1].width, 3840);
  assert.equal(result.representative.fixtures[2].pixel_format, 'yuv420p10le');
  assert.equal(result['maximum-contract'].fixtures[0].seconds, 9000);
  assert.equal(result['maximum-contract'].product_input_limit_bytes, 5 * 1024 ** 3);
  assert.ok(result['maximum-contract'].fixtures[0].vbr_maxrate_bps * 9000 / 8 < 5 * 1024 ** 3);
  assert.ok(result.representative.commands[3].some(arg => arg.includes('noise=alls=100')));
  assert.ok(result.representative.commands[3].includes('-qp'));
  assert.ok(result.representative.commands[2].includes('pools=none:frame-threads=1:wpp=0:ctu=64:ref=1'));
  assert.ok(result.representative.commands[2].includes('zerolatency'));
});

test('CLI cannot generate media without explicit budgets and execute; underfunded maximum refuses', () => {
  const root = path.join(path.dirname(harness), 'never-generated-workload-unit-test');
  const result = spawnSync('python3', [harness, '--tier', 'maximum-contract', '--work-root', root,
    '--cpu-count', '2', '--memory-mib', '1536', '--disk-mib', '4096', '--wall-seconds', '900'], { encoding: 'utf8' });
  assert.equal(result.status, 2);
  assert.equal(JSON.parse(result.stdout).status, 'preflight_refused');
  assert.equal(existsSync(root), false);
  const missing = spawnSync('python3', [harness, '--tier', 'smoke', '--work-root', root], { encoding: 'utf8' });
  assert.equal(missing.status, 2);
  assert.equal(existsSync(root), false);
});

test('plan-only path never creates media even with sufficient mocked resources', () => {
  const root = path.join(path.dirname(harness), 'never-generated-workload-plan-test');
  const result = execFileSync('python3', ['-c', common + `h.supervisor.collect_host=lambda root:{'memory_available_bytes':20*h.supervisor.GIB,'cpu_affinity':[0,1,2,3],'disk_free_bytes':40*h.supervisor.GIB,'cgroup':{}}
sys.argv=['h','--tier','smoke','--work-root',${JSON.stringify(root)},'--cpu-count','2','--memory-mib','1536','--disk-mib','2048','--wall-seconds','180']
raise SystemExit(h.main())`], { encoding: 'utf8' });
  assert.equal(JSON.parse(result).status, 'plan_only_no_media_executed');
  assert.equal(existsSync(root), false);
});

test('phase meter has its own deadline and reaps its child instead of leaving a hanging shim', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'clip-workload-wrapper-'));
  try {
    const binary = path.join(root, 'ffmpeg');
    symlinkSync(wrapper, binary);
    const python = execFileSync('python3', ['-c', 'import sys;print(sys.executable)'], { encoding: 'utf8' }).trim();
    const result = spawnSync(binary, ['-c', 'import time;time.sleep(10)'], {
      timeout: 5000, encoding: 'utf8', env: { ...process.env, CLIP_WORKLOAD_REAL_FFMPEG: python,
        CLIP_WORKLOAD_PHASE_DIR: root, CLIP_WORKLOAD_MEDIA_TIMEOUT_SECONDS: '0.1' },
    });
    assert.equal(result.status, 124);
    const receipt = JSON.parse(readFileSync(path.join(root, readdirSync(root).find(name => name.endsWith('.json'))), 'utf8'));
    assert.equal(receipt.timed_out, true);
    assert.equal(receipt.exit_code, -9);
    assert.ok(receipt.wall_seconds < 1);
    assert.ok(receipt.child_peak_rss_kib > 0);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
