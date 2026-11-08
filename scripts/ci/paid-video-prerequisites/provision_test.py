import hashlib, importlib.util, io, json, subprocess, tempfile, unittest
from types import SimpleNamespace
from pathlib import Path

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
        self.assertEqual(pins['clamavVersion'],'1.5.4'); self.assertEqual(pins['denoVersion'],'2.7.14')

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

if __name__ == '__main__': unittest.main()
