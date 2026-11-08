"""Own exactly one local Docker fixture; never discover or mutate a remote project."""
import base64, hashlib, hmac, io, json, os, re, secrets, socket, subprocess, tarfile, tempfile, time, uuid
from pathlib import Path
from urllib.parse import urlparse
from image_chain import validate_image

HERE = Path(__file__).resolve().parent
LABEL = "io.chillywood.local-auth-fixture.run"
SECRET_FILES = ["edge.private.json", "credentials.private.json", "accounts.private.json", "purchase.private.json", "qualification-state.private.json", "compose.private.json", "gateway.private.json"]
SECRET_KEYS = {"password", "jwtSecret", "anonKey", "serviceRoleKey", "token", "refreshToken", "access_token", "refresh_token", "secret", "keyBase64"}
ROLES = ["db", "auth", "rest", "gateway"]

def local_endpoint(value):
    parsed = urlparse(value)
    return parsed.scheme == "unix" and not parsed.netloc and parsed.path.startswith("/") and not parsed.query and not parsed.fragment

def owned(labels, run_id):
    return isinstance(labels, dict) and labels.get(LABEL) == run_id

def identity_valid(project, run_id):
    return bool(re.fullmatch(r"[a-f0-9]{32}", run_id or "")) and project == "chillywood-auth-fixture-" + run_id[:12]

def prepare_fresh_identity(evidence_root, run_id):
    assert isinstance(run_id, str) and re.fullmatch(r"[a-f0-9]{32}", run_id), "Caller-owned run nonce required"
    requested = Path(evidence_root)
    assert requested.is_absolute(), "Absolute caller-owned evidence root required"
    root = requested.resolve()
    assert str(root) == str(requested), "Canonical exact evidence root required"
    assert root.name == "chillywood-local-auth-" + run_id, "Evidence directory must bind the full nonce"
    root.mkdir(mode=0o700, exist_ok=False)
    assert root.is_dir() and not root.is_symlink() and (root.stat().st_mode & 0o077) == 0
    return root

class Stack:
    def __init__(self, cleanup_path=None, evidence_root=None, run_id=None):
        self.secrets = set()
        self.env = {key: value for key, value in os.environ.items() if key not in ("DOCKER_HOST", "DOCKER_TLS_VERIFY", "DOCKER_CERT_PATH", "DOCKER_CONTEXT", "DOCKER_CONFIG")}
        assert not (cleanup_path and (evidence_root is not None or run_id is not None)), "Cleanup and new-run identities are exclusive"
        self.root = Path(cleanup_path).resolve() if cleanup_path else prepare_fresh_identity(evidence_root, run_id)
        if cleanup_path:
            assert self.root.is_dir() and self.root.name.startswith("chillywood-local-auth-")
            owner = json.loads((self.root / "ownership.json").read_text())
            self.project, self.run_id, self.context = owner["project"], owner["runId"], owner["context"]
            assert owner["root"] == str(self.root) and owner["schemaVersion"] == 1
            assert identity_valid(self.project, self.run_id), "Unknown fixture resource identity"
            self.endpoint, self.daemon_id = owner["endpoint"], owner["daemonId"]
            assert local_endpoint(self.endpoint), "Only a local Unix Docker endpoint is permitted"
            self.docker_args = ["docker", "--host", self.endpoint]
            self.assert_context()
            for name in SECRET_FILES:
                file = self.root / name
                if file.exists(): self.register_secrets(json.loads(file.read_text()))
        else:
            self.run_id = run_id
            self.project = "chillywood-auth-fixture-" + self.run_id[:12]
            self.context = self.raw(["docker", "context", "show"]).strip()
            assert self.context and "\n" not in self.context
            self.docker_args = ["docker", "--context", self.context]
            context = json.loads(self.docker("context", "inspect", self.context))[0]
            self.endpoint = context["Endpoints"]["docker"]["Host"]
            assert local_endpoint(self.endpoint), "Only a local Unix Docker endpoint is permitted"
            # Pin the validated socket for every command; changing the user's
            # active context cannot retarget a later SQL or cleanup operation.
            self.docker_args = ["docker", "--host", self.endpoint]
            self.daemon_id = self.docker("info", "--format", "{{.ID}}").strip()
            assert self.daemon_id
            self.private_write("ownership.json", {"schemaVersion": 1, "root": str(self.root), "project": self.project, "runId": self.run_id, "context": self.context, "endpoint": self.endpoint, "daemonId": self.daemon_id})
        self.profile = json.loads((HERE / "v2-source.json").read_text())

    def register_secrets(self, data, key=None):
        if isinstance(data, dict):
            for name, value in data.items(): self.register_secrets(value, name)
        elif isinstance(data, list):
            for value in data: self.register_secrets(value, key)
        elif key in SECRET_KEYS and isinstance(data, str): self.secrets.add(data)

    def redact(self, value):
        if isinstance(value, dict): return {key: "[redacted]" if key in SECRET_KEYS else self.redact(item) for key, item in value.items()}
        if isinstance(value, list): return [self.redact(item) for item in value]
        if isinstance(value, str):
            for secret in self.secrets:
                if secret: value = value.replace(secret, "[redacted]")
            return re.sub(r"eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+", "[redacted-jwt]", value)
        return value

    def private_write(self, name, value):
        assert Path(name).name == name
        self.register_secrets(value)
        target = self.root / name
        target.write_text(json.dumps(value, indent=2) + "\n"); target.chmod(0o600)

    def write_public(self, name, value):
        assert Path(name).name == name
        (self.root / name).write_text(json.dumps(self.redact(value), indent=2) + "\n")

    def raw(self, args, data=None, timeout=60, binary=False):
        result = subprocess.run(args, input=data, capture_output=True, text=not binary, env=self.env, timeout=timeout)
        if result.returncode:
            error = result.stderr.decode(errors="replace") if binary else result.stderr
            raise RuntimeError(self.redact(error[-5000:]))
        return result.stdout

    def docker(self, *args, **options): return self.raw(self.docker_args + list(args), **options)
    def compose(self, *args): return self.docker("compose", "-f", str(self.root / "compose.private.json"), *args)

    def assert_context(self):
        observed = json.loads(self.docker("context", "inspect", self.context))[0]["Endpoints"]["docker"]["Host"]
        assert local_endpoint(observed) and observed == self.endpoint, "Docker endpoint changed"
        assert self.docker("info", "--format", "{{.ID}}").strip() == self.daemon_id, "Docker daemon changed"

    def resources(self):
        return [("container", self.project + "-" + role) for role in ROLES] + [("network", self.project), ("network", self.project + "-ingress"), ("volume", self.project + "-database")]

    def inspect_resource(self, kind, name):
        result = subprocess.run(self.docker_args + [kind, "inspect", name], env=self.env, text=True, capture_output=True, timeout=20)
        if result.returncode:
            if re.search(r"No such (?:container|object|network|volume)|not found", result.stderr, re.I): return None
            raise RuntimeError(self.redact(result.stderr))
        return json.loads(result.stdout)[0]

    def validate_resources(self, must_be_absent=False):
        self.assert_context()
        observed = []
        for kind, name in self.resources():
            item = self.inspect_resource(kind, name)
            if item is None: continue
            assert not must_be_absent, "Fixture resource name already exists: " + name
            labels = item.get("Config", {}).get("Labels") if kind == "container" else item.get("Labels")
            assert owned(labels, self.run_id), "Refusing unowned Docker resource: " + name
            observed.append({"kind": kind, "name": name})
        return observed

    def freeze_source(self):
        repo = HERE.parent / "snapshot"
        assert repo.is_dir()
        source = self.root / "source-v2"; source.mkdir()
        for item in self.profile["files"]:
            raw = (repo / item["path"]).read_bytes()
            assert hashlib.sha256(raw).hexdigest() == item["sha256"], "Immutable source hash mismatch"
            name = item["installName"]
            assert not Path(name).is_absolute() and ".." not in Path(name).parts
            destination = source / name; destination.parent.mkdir(parents=True, exist_ok=True); destination.write_bytes(raw)
        premium = (source / "tests/premium-authority.fixture.sql").read_text().split("create schema premium_fixture;")[0]
        authority = (source / "tests/authority.fixture.sql").read_text()
        authority = authority[authority.index("create table public.account_deletion_requests"):authority.index("create table sandbox_commerce_v1.declarations")]
        projection = "-- Explicit synthetic public projections only. Real auth schema is owned by the official Auth service.\n" + premium + "\n" + authority + "\ncreate table public.channel_audience_blocks(channel_user_id text,blocked_user_id text);\n"
        assert "create schema auth;" not in projection and "create table auth." not in projection
        assert hashlib.sha256(projection.encode()).hexdigest() == self.profile["publicProjectionsSha256"]
        (source / "synthetic-public-projections.sql").write_text(projection)
        (source / "manifest.json").write_text(json.dumps(self.profile, indent=2) + "\n")

    def prepare(self):
        for port in (59431,59432,59433):
            with socket.socket() as listener: listener.bind(("127.0.0.1", port))
        self.validate_resources(must_be_absent=True)
        pins = json.loads((HERE.parent / "image-chains.json").read_text())
        assert pins["protocol"] == "scpv-public-image-chain-pins-v1"
        assert set(pins["images"]) == set(self.profile["images"])
        chains = {}
        for name, image in self.profile["images"].items():
            item = json.loads(self.docker("image", "inspect", image))[0]
            chains[name] = validate_image(pins["images"][name], image, item)
        self.write_public("image-chain-proof.json", chains)
        self.freeze_source()
        self.prepare_compose()
        inputs = json.loads((HERE.parent / "execution-inputs.json").read_text())
        assert all(hashlib.sha256((HERE.parent / name).read_bytes()).hexdigest() == digest for name, digest in inputs.items()), "Frozen execution inputs changed"
        self.write_public("harness-source-hashes.json", inputs)
        self.write_public("stack-provenance.json", {"sourceProfile": self.profile, "localUnixDockerEndpoint": True, "dockerServerVersion": self.docker("version", "--format", "{{.Server.Version}}").strip(), "project": self.project, "root": str(self.root), "runId": self.run_id, "freshVolume": True, "reusedCliVolume": False, "repoMigrationBootstrapExecuted": False})

    def assert_harness_source(self):
        expected = json.loads((self.root / "harness-source-hashes.json").read_text())
        assert all(hashlib.sha256((HERE.parent / name).read_bytes()).hexdigest() == digest for name, digest in expected.items()), "Harness source changed during qualification"

    def prepare_compose(self):
        password, jwt_secret = secrets.token_hex(24), secrets.token_hex(32)
        def b64(value): return base64.urlsafe_b64encode(value).decode().rstrip("=")
        def jwt(role):
            message = b64(b'{"alg":"HS256","typ":"JWT"}') + "." + b64(json.dumps({"role": role, "iss": "supabase", "iat": int(time.time()), "exp": int(time.time()) + 86400}, separators=(",", ":")).encode())
            return message + "." + b64(hmac.new(jwt_secret.encode(), message.encode(), hashlib.sha256).digest())
        credentials = {"password": password, "jwtSecret": jwt_secret, "anonKey": jwt("anon"), "serviceRoleKey": jwt("service_role")}
        self.private_write("credentials.private.json", credentials)
        labels = {LABEL: self.run_id}
        services = {name: {"image": image, "container_name": self.project + "-" + name, "restart": "no", "pull_policy": "never", "labels": labels} for name, image in self.profile["images"].items()}
        services["db"].update({"environment": {"POSTGRES_PASSWORD": password, "POSTGRES_DB": "postgres", "POSTGRES_USER": "supabase_admin"}, "volumes": ["database:/var/lib/postgresql/data"], "healthcheck": {"test": ["CMD", "pg_isready", "-U", "postgres", "-h", "127.0.0.1"], "interval": "2s", "timeout": "2s", "retries": 20}})
        services["auth"].update({"environment": {"GOTRUE_API_HOST": "0.0.0.0", "GOTRUE_API_PORT": "9999", "API_EXTERNAL_URL": "http://127.0.0.1:59431/auth/v1", "GOTRUE_DB_DRIVER": "postgres", "GOTRUE_DB_DATABASE_URL": f"postgres://supabase_auth_admin:{password}@db:5432/postgres", "GOTRUE_SITE_URL": "http://127.0.0.1:59431", "GOTRUE_DISABLE_SIGNUP": "false", "GOTRUE_EXTERNAL_EMAIL_ENABLED": "true", "GOTRUE_MAILER_AUTOCONFIRM": "true", "GOTRUE_EXTERNAL_PHONE_ENABLED": "false", "GOTRUE_EXTERNAL_ANONYMOUS_USERS_ENABLED": "false", "GOTRUE_JWT_SECRET": jwt_secret, "GOTRUE_JWT_EXP": "3600", "GOTRUE_JWT_AUD": "authenticated", "GOTRUE_JWT_DEFAULT_GROUP_NAME": "authenticated", "GOTRUE_JWT_ADMIN_ROLES": "service_role", "GOTRUE_RATE_LIMIT_EMAIL_SENT": "1000", "GOTRUE_RATE_LIMIT_TOKEN_REFRESH": "1000"}, "depends_on": {"db": {"condition": "service_healthy"}}})
        services["rest"].update({"environment": {"PGRST_DB_URI": f"postgres://authenticator:{password}@db:5432/postgres", "PGRST_DB_SCHEMAS": "public", "PGRST_DB_ANON_ROLE": "anon", "PGRST_JWT_SECRET": jwt_secret, "PGRST_DB_EXTRA_SEARCH_PATH": "public,extensions", "PGRST_DB_POOL": "5", "PGRST_DB_MAX_ROWS": "1000"}, "depends_on": {"db": {"condition": "service_healthy"}}})
        gateway = {"_format_version": "2.1", "consumers": [{"username": "anon", "keyauth_credentials": [{"key": credentials["anonKey"]}]}, {"username": "service", "keyauth_credentials": [{"key": credentials["serviceRoleKey"]}]}], "services": [{"name": name, "url": url, "routes": [{"name": name, "paths": [route], "strip_path": True}], "plugins": [{"name": "key-auth", "config": {"hide_credentials": False}}]} for name, url, route in [("auth", "http://auth:9999/", "/auth/v1/"), ("rest", "http://rest:3000/", "/rest/v1/")]]}
        self.private_write("gateway.private.json", gateway)
        services["gateway"].update({"environment": {"KONG_DATABASE": "off", "KONG_DECLARATIVE_CONFIG": "/tmp/gateway.json", "KONG_PROXY_LISTEN": "0.0.0.0:8000", "KONG_ADMIN_LISTEN": "off", "KONG_PROXY_ACCESS_LOG": "/dev/null", "KONG_DNS_ORDER": "LAST,A,CNAME", "KONG_PLUGINS": "key-auth"}, "ports": ["127.0.0.1:59431:8000"], "networks": ["default", "ingress"], "depends_on": ["auth", "rest"]})
        self.private_write("compose.private.json", {"name": self.project, "services": services, "networks": {"default": {"internal": True, "name": self.project, "labels": labels}, "ingress": {"name": self.project + "-ingress", "labels": labels}}, "volumes": {"database": {"name": self.project + "-database", "labels": labels}}})

    def start_database(self):
        self.compose("create", "--no-build", "--pull", "never")
        self.validate_resources()
        archive = self.docker("cp", self.project + "-gateway:/etc/passwd", "-", binary=True)
        with tarfile.open(fileobj=io.BytesIO(archive)) as tar:
            passwd = tar.extractfile(tar.getmembers()[0]).read().decode()
        user = next(line.split(":") for line in passwd.splitlines() if line.startswith("kong:"))
        data = (self.root / "gateway.private.json").read_bytes(); buffer = io.BytesIO()
        with tarfile.open(fileobj=buffer, mode="w") as tar:
            item = tarfile.TarInfo("gateway.json"); item.size, item.uid, item.gid, item.mode = len(data), int(user[2]), int(user[3]), 0o600
            item.uname = item.gname = "kong"; tar.addfile(item, io.BytesIO(data))
        self.docker("cp", "-a", "-", self.project + "-gateway:/tmp", data=buffer.getvalue(), binary=True)
        self.docker("compose", "-f", str(self.root / "compose.private.json"), "up", "-d", "--pull", "never", "--wait", "--wait-timeout", "120", "db", timeout=150)

    def start_services(self):
        self.compose("start", "auth", "rest", "gateway")
        self.validate_resources()

    def capture_failure_logs(self):
        # Diagnose only this attempt, after the same ownership/daemon checks
        # used by cleanup. Logs are bounded and credentials are redacted.
        self.validate_resources()
        diagnostics = {}
        for role in ROLES:
            name = self.project + "-" + role
            item = self.inspect_resource("container", name)
            if item is None: continue
            result = subprocess.run(self.docker_args + ["logs", "--tail", "100", name], env=self.env, text=True, capture_output=True, timeout=20)
            diagnostics[role] = {"state": item["State"], "stdout": result.stdout[-12000:], "stderr": result.stderr[-12000:]}
        self.write_public("failure-services.json", diagnostics)

    def cleanup(self):
        observed = self.validate_resources()
        if observed:
            assert (self.root / "compose.private.json").is_file(), "Owned runtime needs its retained Compose configuration"
            self.compose("down", "--volumes", "--timeout", "5")
        remaining = self.validate_resources()
        assert not remaining, "Task-owned Docker resources remain"
        removed = []
        for name in SECRET_FILES:
            file = self.root / name
            if file.exists(): file.unlink(); removed.append(name)
        target = "cleanup-repeat-proof.json" if (self.root / "cleanup-proof.json").exists() else "cleanup-proof.json"
        self.write_public(target, {"project": self.project, "taskResourcesRemaining": remaining, "generatedSecretFilesRemoved": removed, "unownedResourcesTouched": False})
        return True
