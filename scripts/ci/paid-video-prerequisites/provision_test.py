import copy, hashlib, importlib.util, io, json, shutil, subprocess, sys, tempfile, unittest
from types import SimpleNamespace
from pathlib import Path
from unittest.mock import call, patch

spec = importlib.util.spec_from_file_location("provision", Path(__file__).with_name("provision.py"))
module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)

class Response(io.BytesIO):
    def __init__(self, data, url="https://github.com/Cisco-Talos/clamav/test"):
        super().__init__(data); self.url = url
    def geturl(self): return self.url

class Opener:
    def __init__(self, value, url=None): self.value, self.url, self.calls = value, url, 0
    def open(self, url, timeout):
        self.calls += 1
        return Response(self.value, self.url or url)

class PrerequisiteBoundaries(unittest.TestCase):
    def test_official_artifact_exact_hash_and_length(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "artifact"; data = b"bounded synthetic fixture"
            pin = {"url":"https://github.com/Cisco-Talos/clamav/test", "bytes":len(data), "sha256":hashlib.sha256(data).hexdigest()}
            opener = Opener(data); module.download(pin,target,opener)
            self.assertEqual(target.read_bytes(),data); self.assertEqual(opener.calls,1)

    def test_overlength_truncation_and_hash_mismatch_never_publish(self):
        for value, length, digest in [(b"abc",2,"0"*64),(b"a",2,"0"*64),(b"ab",2,"0"*64)]:
            with self.subTest(value=value), tempfile.TemporaryDirectory() as directory:
                target=Path(directory)/"artifact"; opener=Opener(value)
                with self.assertRaises(ValueError):
                    module.download({"url":"https://github.com/x","bytes":length,"sha256":digest},target,opener)
                self.assertFalse(target.exists()); self.assertFalse(list(Path(directory).iterdir())); self.assertEqual(opener.calls,1)

    def test_download_cannot_redirect_to_unapproved_or_insecure_host(self):
        for url in ["http://github.com/x","https://example.com/x","https://user:password@github.com/x","https://github.com:443/x","file:///tmp/x"]:
            with self.subTest(url=url), self.assertRaises(ValueError): module.validate_download_url(url)
        with tempfile.TemporaryDirectory() as directory:
            target=Path(directory)/"artifact"
            with self.assertRaises(ValueError): module.download({"url":"https://github.com/x","bytes":1,"sha256":hashlib.sha256(b"a").hexdigest()},target,Opener(b"a","https://attacker.invalid/x"))
            self.assertFalse(target.exists())

    def test_host_gate_denies_local_root_wrong_os_and_remote_context(self):
        env={"GITHUB_ACTIONS":"true","RUNNER_ENVIRONMENT":"github-hosted","RUNNER_OS":"Linux"}; release='ID=ubuntu\nVERSION_ID="24.04"\n'
        module.assert_host(env,"Linux","x86_64",release,1001)
        cases=[({},"Linux","x86_64",release,1001),(env,"Darwin","x86_64",release,1001),(env,"Linux","aarch64",release,1001),(env,"Linux","x86_64",release,0),(env,"Linux","x86_64","ID=debian\nVERSION_ID=12",1001)]
        for case in cases:
            with self.subTest(case=case), self.assertRaises(ValueError): module.assert_host(*case)
        with self.assertRaises(ValueError): module.assert_host({**env,"RUNNER_ENVIRONMENT":"self-hosted"},"Linux","x86_64",release,1001)
        for key in ["DOCKER_HOST","DOCKER_TLS_VERIFY","DOCKER_CERT_PATH","DOCKER_CONTEXT","DENO_DIR"]:
            with self.subTest(key=key), self.assertRaises(ValueError): module.assert_host({**env,key:"nondefault"},"Linux","x86_64",release,1001)

    def test_freshclam_has_only_supported_single_attempt_official_source(self):
        text=module.freshclam_config(Path('/private/db'),Path('/usr/local/etc/certs'),'runner')
        self.assertIn('MaxAttempts 1\n',text); self.assertIn('ScriptedUpdates no\n',text)
        self.assertEqual(text.count('DatabaseMirror'),1); self.assertIn('DatabaseMirror database.clamav.net\n',text)
        self.assertNotIn('DatabaseCustomURL',text); self.assertNotIn('HTTPProxy',text)
        for owner in ['runner\nDatabaseMirror other','runner user','$(command)']:
            with self.assertRaises(ValueError): module.freshclam_config(Path('/private/db'),Path('/certs'),owner)

    def test_signature_requires_exact_primary_identity_and_no_expiry(self):
        expected=module.PINS['talosKey']['fingerprint']
        status='[GNUPG:] VALIDSIG '+expected+' 2026-08-07 1 0 4 0 1 10 00 '+expected+'\n'
        module.verify_gpg_status(status,expected)
        for changed in ['',status.replace(expected,'0'*40),status+status,status+'[GNUPG:] EXPKEYSIG key name\n',status+'[GNUPG:] BADSIG key name\n']:
            with self.subTest(changed=changed), self.assertRaises(ValueError): module.verify_gpg_status(changed,expected)

    def test_package_pins_are_not_database_pins_or_private_artifacts(self):
        pins=module.PINS
        for name in ['clamav','signature','talosKey','deno']:
            self.assertRegex(pins[name]['sha256'],r'^[a-f0-9]{64}$'); module.validate_download_url(pins[name]['url'])
        self.assertNotIn('database.clamav.net',json.dumps(pins))
        self.assertEqual(pins['ffmpegPackageVersion'],'7:6.1.1-3ubuntu5')
        self.assertEqual(pins['clamavVersion'],'1.5.4'); self.assertEqual(pins['denoVersion'],'2.7.14')

class StopBeforeDownload(Exception):
    pass

class SignedUbuntuFfmpeg(unittest.TestCase):
    update = ["sudo", "apt-get", "update"]
    install = ["sudo", "apt-get", "install", "--no-install-recommends", "-y", "ca-certificates", "gnupg", "ffmpeg=7:6.1.1-3ubuntu5"]
    query = ["dpkg-query", "-W", "-f=${Version}", "ffmpeg"]

    def setUp(self):
        directory = Path(self.enterContext(tempfile.TemporaryDirectory()))
        self.repo = directory / "repo"; self.repo.mkdir()
        self.output = directory / "prerequisites"
        # Exercise provision() and its real run() wrapper, but never execute a
        # host command or download on the machine running these source tests.
        self.enterContext(patch.object(module, "assert_host"))
        self.enterContext(patch.object(module, "require_git_baselines"))
        self.runner = self.enterContext(patch.object(module.subprocess, "run"))
        self.download = self.enterContext(patch.object(module, "download", side_effect=StopBeforeDownload))

    def result(self, stdout="", returncode=0, stderr=""):
        return SimpleNamespace(stdout=stdout, returncode=returncode, stderr=stderr)

    def expected_calls(self):
        return [call(args, capture_output=True, text=True, env=None, timeout=timeout)
            for args, timeout in [(self.update, 240), (self.install, 1200), (self.query, 120)]]

    def test_install_has_twenty_minutes_without_changing_signed_command_or_other_budgets(self):
        self.runner.side_effect = [self.result(), self.result(), self.result("7:6.1.1-3ubuntu5\n")]
        with self.assertRaises(StopBeforeDownload): module.provision(self.repo, self.output)
        self.assertEqual(self.runner.call_args_list, self.expected_calls())
        self.download.assert_called_once()
        proof = json.loads((self.output / "prerequisite-proof.json").read_text())
        self.assertEqual(proof["steps"], [{"step": "signed-ubuntu-ffmpeg", "version": "7:6.1.1-3ubuntu5"}])
        self.assertEqual(proof["status"], "incomplete")

    def test_installed_version_mismatch_still_stops_provisioning(self):
        self.runner.side_effect = [self.result(), self.result(), self.result("unreviewed-version\n")]
        with self.assertRaisesRegex(ValueError, "FFmpeg package version mismatch"):
            module.provision(self.repo, self.output)
        self.assertEqual(self.runner.call_args_list, self.expected_calls())
        self.download.assert_not_called()
        self.assertFalse((self.output / "prerequisite-proof.json").exists())

    def test_install_timeout_and_authentication_failure_have_no_retry_or_fallback(self):
        outcomes = [(subprocess.TimeoutExpired(self.install, 1200), subprocess.TimeoutExpired),
            (self.result(returncode=100, stderr="Packages cannot be authenticated"), RuntimeError)]
        for index, (outcome, error) in enumerate(outcomes):
            with self.subTest(error=error):
                self.runner.reset_mock(); self.runner.side_effect = [self.result(), outcome]
                output = self.output.with_name("failed-prerequisites-" + str(index))
                with self.assertRaises(error): module.provision(self.repo, output)
                self.assertEqual(self.runner.call_args_list, self.expected_calls()[:2])
                self.download.assert_not_called()
                self.assertFalse((output / "prerequisite-proof.json").exists())

class PinnedImageRetries(unittest.TestCase):
    image = "public.ecr.aws/supabase/kong@sha256:" + "1" * 64
    docker = ["docker", "--config", "/private/empty-public-config", "--host", "unix:///var/run/docker.sock"]

    def fixture(self, outcomes, durations=None):
        clock = [0]; calls = []; sleeps = []; queue = list(outcomes); durations = iter(durations or [0] * len(queue))
        def runner(args, **kwargs):
            calls.append((list(args), kwargs)); clock[0] += next(durations)
            value = queue.pop(0)
            if isinstance(value, Exception): raise value
            return SimpleNamespace(returncode=0 if value is None else 1, stdout="pulled", stderr=value or "")
        def sleep(seconds): sleeps.append(seconds); clock[0] += seconds
        return dict(runner=runner, sleep=sleep, monotonic=lambda: clock[0]), calls, sleeps

    def test_success_has_no_retry_and_keeps_exact_public_command(self):
        options, calls, sleeps = self.fixture([None])
        self.assertEqual(module.pull_pinned_image(self.docker, self.image, **options), "pulled")
        self.assertEqual(calls, [(self.docker + ["pull", "--platform", "linux/amd64", self.image], dict(capture_output=True, text=True, timeout=240))]); self.assertEqual(sleeps, [])

    def test_only_exact_ecr_throttles_retry_same_digest(self):
        options, calls, sleeps = self.fixture(["toomanyrequests: Rate exceeded", "Error response from daemon: toomanyrequests: Rate exceeded", None])
        module.pull_pinned_image(self.docker, self.image, **options)
        self.assertEqual(sleeps, [15, 45]); self.assertEqual(len(calls), 3)
        self.assertTrue(all(args == calls[0][0] for args, _ in calls)); self.assertEqual([kw["timeout"] for _, kw in calls], [240, 240, 240])

    def test_throttle_exhaustion_stops_after_three_attempts(self):
        options, calls, sleeps = self.fixture(["toomanyrequests: Rate exceeded"] * 4)
        with self.assertRaises(RuntimeError): module.pull_pinned_image(self.docker, self.image, **options)
        self.assertEqual(len(calls), 3); self.assertEqual(sleeps, [15, 45])

    def test_quota_auth_network_manifest_and_digest_errors_never_retry(self):
        for reason in ["toomanyrequests: You have reached your pull rate limit. 6 hours", "quota exceeded", "unauthorized", "denied", "manifest unknown", "digest mismatch", "connection reset", "429 Too Many Requests", "toomanyrequests: Rate exceeded; quota exhausted"]:
            with self.subTest(reason=reason):
                options, calls, sleeps = self.fixture([reason])
                with self.assertRaises(RuntimeError): module.pull_pinned_image(self.docker, self.image, **options)
                self.assertEqual(len(calls), 1); self.assertEqual(sleeps, [])

    def test_timeout_is_not_retried(self):
        options, calls, sleeps = self.fixture([subprocess.TimeoutExpired("docker", 240)])
        with self.assertRaises(subprocess.TimeoutExpired): module.pull_pinned_image(self.docker, self.image, **options)
        self.assertEqual(len(calls), 1); self.assertEqual(sleeps, [])

    def test_deadline_caps_remaining_attempt_and_forbids_extra_backoff(self):
        options, calls, sleeps = self.fixture(["toomanyrequests: Rate exceeded"] * 2, [240, 40])
        with self.assertRaises(TimeoutError): module.pull_pinned_image(self.docker, self.image, **options)
        self.assertEqual([kw["timeout"] for _, kw in calls], [240, 45]); self.assertEqual(sleeps, [15])

    def test_unpinned_or_other_registry_never_executes(self):
        for image in ["public.ecr.aws/supabase/kong:latest", self.image.replace("public.ecr.aws", "docker.io")]:
            options, calls, sleeps = self.fixture([])
            with self.assertRaises(ValueError): module.pull_pinned_image(self.docker, image, **options)
            self.assertEqual(calls, []); self.assertEqual(sleeps, [])

REPO=Path(__file__).resolve().parents[3]
FIXTURE=REPO/'isolated-runtime/sandbox-commerce-v1/tests/local-auth-paid-video-retained-platform-v2'
prepare_spec=importlib.util.spec_from_file_location('prepare',FIXTURE/'prepare.py')
prepare=importlib.util.module_from_spec(prepare_spec);prepare_spec.loader.exec_module(prepare)

class SourcePreparation(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.manifest,cls.package,cls.sources,cls.closure=prepare.validate(REPO)

    def test_current_source_preflight_has_complete_listener_closure_and_frozen_baseline(self):
        self.assertEqual(len(self.sources),86)
        self.assertEqual(self.closure['entryDependencyCount'],23)
        predecessor=json.loads((FIXTURE.parent/'local-auth-paid-video-retained-platform-v1/manifest.json').read_text())
        self.assertEqual(self.manifest['baselineGitBlobs'],predecessor['baselineGitBlobs'])
        for name in self.manifest['baselineGitBlobs']:
            self.assertEqual(self.manifest['files'][name],predecessor['files'][name])
        self.assertEqual(self.manifest['source'],prepare.source_identity(self.manifest))
        self.assertNotEqual(self.manifest['source'],'22c7dcfd9a2569b9b902db79f8468df90c1058b53fe663cdefe01a63bcd663b2')
        result=subprocess.run([sys.executable,str(FIXTURE/'prepare.py'),'--repo',str(REPO),'--check'],capture_output=True,text=True)
        self.assertEqual(result.returncode,0,result.stderr)
        self.assertFalse(json.loads(result.stdout)['servicesStarted'])

    def private_repo(self,directory):
        repo=Path(directory)/'repo';repo.mkdir()
        (repo/'.git').symlink_to(REPO/'.git',target_is_directory=True)
        (repo/'node_modules').symlink_to(REPO/'node_modules',target_is_directory=True)
        for name,raw in self.sources.items():
            target=repo/name;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(raw)
        return repo

    def test_any_current_source_byte_drift_is_rejected_before_materialization(self):
        names=['supabase/functions/_shared/isolated-paid-video-'+name+'.ts' for name in ['runtime','rpc','contract','r2-upload']]
        names+=['ops/isolated-paid-video-worker/r2-'+name+'.mjs' for name in ['http','protocol','native']]
        with tempfile.TemporaryDirectory() as directory:
            repo=self.private_repo(directory)
            for name in names:
                with self.subTest(name=name):
                    target=repo/name;target.write_bytes(self.sources[name]+b'\n')
                    with self.assertRaisesRegex(AssertionError,'Source hash mismatch: '+name):prepare.validate(repo)
                    target.write_bytes(self.sources[name])

    def test_baseline_reads_never_adopt_current_working_tree_bytes(self):
        with tempfile.TemporaryDirectory() as directory:
            repo=self.private_repo(directory)
            for name in self.manifest['baselineGitBlobs']:(repo/name).write_text('unrelated current working tree\n')
            _,_,sources,_=prepare.validate(repo)
            for name in self.manifest['baselineGitBlobs']:self.assertEqual(sources[name],self.sources[name])

    def test_each_new_transitive_dependency_must_be_pinned(self):
        names=['supabase/functions/_shared/isolated-paid-video-r2-upload.ts']
        names+=['ops/isolated-paid-video-worker/r2-'+name+'.mjs' for name in ['http','protocol','native']]
        for name in names:
            sources=dict(self.sources);del sources[name]
            with self.subTest(name=name),self.assertRaisesRegex(AssertionError,'Unpinned local dependency'):
                prepare.validate_source_closure(REPO,self.manifest,sources,(FIXTURE/'listener.ts').read_text())

    def test_unreviewed_static_dynamic_type_and_export_imports_fail_closed(self):
        name='supabase/functions/_shared/isolated-paid-video-runtime.ts'
        for appended,reason in [
            ('import "./unreviewed.ts";','Unpinned local dependency'),
            ('export * from "./unreviewed.ts";','Unpinned local dependency'),
            ('type Unreviewed = import("./unreviewed.ts").Value;','Unpinned local dependency'),
            ('await import("./unreviewed.ts");','Unpinned local dependency'),
            ('await import(runtimeSelectedPath);','Nonliteral dependency'),
            ('import "https://unreviewed.invalid/runtime.ts";','Unpinned external dependency'),
            ('import "../../../../outside.ts";','Dependency escapes snapshot'),
        ]:
            sources=dict(self.sources);sources[name]+=('\n'+appended+'\n').encode()
            with self.subTest(appended=appended),self.assertRaisesRegex(AssertionError,reason):
                prepare.validate_source_closure(REPO,self.manifest,sources,(FIXTURE/'listener.ts').read_text())

    def test_extra_entry_and_rehashed_missing_closure_member_are_rejected(self):
        manifest=copy.deepcopy(self.manifest);manifest['entryDependencyClosure'].pop()
        manifest['source']=prepare.source_identity(manifest)
        with self.assertRaisesRegex(AssertionError,'Entry dependency closure changed'):
            prepare.validate_source_closure(REPO,manifest,self.sources,(FIXTURE/'listener.ts').read_text())
        listener=(FIXTURE/'listener.ts').read_text()+"\nimport './snapshot/ops/isolated-paid-video-worker/r2-native.mjs';\n"
        with self.assertRaisesRegex(AssertionError,'Listener entry set changed'):
            prepare.validate_source_closure(REPO,self.manifest,self.sources,listener)

    def test_source_identity_and_template_hash_checks_cannot_be_skipped(self):
        with tempfile.TemporaryDirectory() as directory:
            fixture=Path(directory)/'fixture';shutil.copytree(FIXTURE,fixture)
            with patch.object(prepare,'HERE',fixture):
                manifest=copy.deepcopy(self.manifest);manifest['files'][manifest['entries'][0]]['bytes']+=1
                (fixture/'manifest.json').write_text(json.dumps(manifest))
                with self.assertRaisesRegex(AssertionError,'Manifest source identity mismatch'):prepare.validate(REPO)
                (fixture/'manifest.json').write_bytes((FIXTURE/'manifest.json').read_bytes())
                (fixture/'listener.ts').write_text('changed template')
                with self.assertRaisesRegex(AssertionError,'Template hash mismatch: listener.ts'):prepare.validate(REPO)

if __name__ == '__main__': unittest.main()
