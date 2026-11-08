#!/usr/bin/env python3
"""Real local Auth/PostgREST transport over a frozen source bundle.

All URLs and container targets are fixed to this disposable fixture. Public
Premium/legal facts are synthetic; Auth users and sessions must come from Auth.
"""
import base64, hashlib, json, os, re, secrets, subprocess, sys, time, urllib.error, urllib.request, uuid
from pathlib import Path

ROOT = SOURCE = DB = MANIFEST = STACK = None
API = "http://127.0.0.1:59431"
CREDENTIALS = {}
DOCKER_ARGS = []
PROJECT = None

def configure(stack):
    global ROOT, SOURCE, DB, MANIFEST, CREDENTIALS, DOCKER_ARGS, PROJECT, STACK
    assert STACK is None, "One isolated attempt per process"
    STACK = stack
    ROOT, PROJECT = stack.root, stack.project
    SOURCE, DB = ROOT / "source-v2", PROJECT + "-db"
    MANIFEST = json.loads((SOURCE / "manifest.json").read_text())
    CREDENTIALS = json.loads((ROOT / "credentials.private.json").read_text())
    DOCKER_ARGS = stack.docker_args

def configure_services():
    password = CREDENTIALS["password"]
    assert password.isalnum()
    assert sql("select count(*) from auth.users;") == "0"
    sql("alter role supabase_auth_admin with password '" + password + "'; alter role authenticator with password '" + password + "';")


def sql(statement, user="supabase_admin"):
    assert user in ("supabase_admin", "postgres")
    result = subprocess.run(DOCKER_ARGS + ["exec", "-i", DB, "psql", "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-U", user, "-d", "postgres"], input=statement, text=True, capture_output=True, timeout=30, env=STACK.env)
    if result.returncode:
        message = result.stderr
        for value in CREDENTIALS.values(): message = message.replace(value, "[redacted]")
        raise RuntimeError(message[-5000:])
    return result.stdout.strip()

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl): raise RuntimeError("Local fixture redirect forbidden")
OPENER = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect)
def http(path, token=None, data=None, method=None, extra_headers=None):
    assert path.startswith(("/auth/v1/", "/rest/v1/"))
    headers = {"apikey": CREDENTIALS["anonKey"], "Content-Type": "application/json"}
    if token: headers["Authorization"] = "Bearer " + token
    headers.update(extra_headers or {})
    request = urllib.request.Request(API + path, data=None if data is None else json.dumps(data).encode(), headers=headers, method=method)
    started = time.monotonic()
    try:
        response = OPENER.open(request, timeout=15)
        status, raw = response.status, response.read()
    except urllib.error.HTTPError as error:
        status, raw = error.code, error.read()
    try: body = json.loads(raw) if raw else None
    except ValueError: body = {"nonJsonResponse": True}
    return status, body, time.monotonic() - started

def private_write(name, data):
    STACK.private_write(name, data)

def quote(value): return "'" + str(value).replace("'", "''") + "'"
def claims(token): return json.loads(base64.urlsafe_b64decode(token.split(".")[1] + "=="))
def rpc(account, command="capability.read", payload=None, function="isolated_sandbox_tips_v1", expected=None):
    body = {"p_command": command, "p_payload": {"protocol": "sandbox-commerce-v1", "requestId": str(uuid.uuid4()), **(payload or {})},
        "p_expected_account_id": account["userId"], "p_expected_session_generation": account["sessionId"]}
    body.update(expected or {})
    return http("/rest/v1/rpc/" + function, account["token"], body)

def verify():
    proof = []
    gateway_health = None
    for role in ["db", "auth", "rest", "gateway"]:
        item = json.loads(subprocess.check_output(DOCKER_ARGS + ["inspect", PROJECT + "-" + role], env=STACK.env, timeout=20))[0]
        ports = item["NetworkSettings"].get("Ports", {})
        assert item["State"]["Status"] == "running"
        if role == "gateway":
            assert ports.get("8000/tcp") == [{"HostIp": "127.0.0.1", "HostPort": "59431"}]
            gateway_health = item["State"]["Health"]["Status"]
        else: assert not any(ports.values())
        proof.append({"service": role, "actualPublishedPorts": ports, "image": item["Image"]})
    # The pinned image performs its own Kong startup/health probe. Container
    # "running" precedes an actual proxy process; do not consume the HTTP
    # readiness budget during that initialization. Mapping checks above remain
    # terminal and precede this bounded local-only health wait.
    health_started = time.monotonic()
    while gateway_health != "healthy":
        assert gateway_health == "starting", "Local gateway health failed"
        if time.monotonic() - health_started >= 60:
            raise RuntimeError("Local gateway health did not become ready within 60 seconds")
        time.sleep(1)
        item = json.loads(subprocess.check_output(DOCKER_ARGS + ["inspect", PROJECT + "-gateway"], env=STACK.env, timeout=20))[0]
        assert item["State"]["Status"] == "running"
        assert item["NetworkSettings"]["Ports"].get("8000/tcp") == [{"HostIp": "127.0.0.1", "HostPort": "59431"}]
        gateway_health = item["State"]["Health"]["Status"]
    STACK.write_public("gateway-health-proof.json", {"status": gateway_health, "waitSeconds": time.monotonic() - health_started})
    # Binding/ownership failures above are terminal. Poll only transient HTTP
    # readiness; never leave an unsafe mapping running while retrying it.
    readiness = []
    for attempt in range(20):
        try:
            statuses = [http("/auth/v1/health")[0], http("/rest/v1/")[0]]
            readiness.append({"attempt": attempt + 1, "statuses": statuses})
            assert all(status in (200, 502, 503) for status in statuses), "Local gateway configuration rejected"
            if statuses == [200, 200]: break
        except (urllib.error.URLError, ConnectionError, TimeoutError) as error:
            readiness.append({"attempt": attempt + 1, "transportError": str(error)})
        if attempt == 19:
            STACK.write_public("readiness-failure.json", readiness)
            raise RuntimeError("Local gateway readiness failed; bounded service diagnostics retained")
        time.sleep(0.5)
    (ROOT / "loopback-bindings.json").write_text(json.dumps(proof, indent=2) + "\n")
    print("Actual loopback gateway and unpublished database/Auth/REST verified")

def install():
    verify()
    assert sql("select count(*) from auth.users;") == "0"
    assert sql("select count(*) from pg_namespace where nspname='sandbox_commerce_v1';") == "0"
    for item in MANIFEST["files"]:
        name = item["installName"]
        assert not Path(name).is_absolute() and ".." not in Path(name).parts
        assert hashlib.sha256((SOURCE / name).read_bytes()).hexdigest() == item["sha256"]
    projection = (SOURCE / "synthetic-public-projections.sql").read_text()
    assert hashlib.sha256(projection.encode()).hexdigest() == MANIFEST["publicProjectionsSha256"]
    tables = re.findall(r"create table public\.([a-z0-9_]+)", projection)
    assert len(tables) == 19 and "create table auth." not in projection
    privileges = "grant usage on schema auth to postgres; grant select,maintain on auth.users,auth.sessions to postgres;\n"
    for table in tables:
        privileges += f"alter table public.{table} enable row level security; alter table public.{table} force row level security; revoke all on public.{table} from public,anon,authenticated,service_role; grant select,maintain on public.{table} to postgres;\n"
    sql("begin;" + projection + privileges + "commit;")
    # Three unchanged repository definitions; this is not a migration-chain bootstrap.
    shared = "\n".join((Path(__file__).resolve().parent.parent / (name + ".sql")).read_text() for name in
        ["is_account_deletion_scheduled", "is_account_access_restricted", "wave1_session_authority_readback"])
    sql("alter table public.account_deletion_requests add column restore_deadline timestamptz, add column delete_after timestamptz;")
    sql("begin;" + shared + "revoke all on function public.is_account_deletion_scheduled(text),public.is_account_access_restricted(text),public.wave1_session_authority_readback() from public,anon,authenticated,service_role;grant execute on function public.wave1_session_authority_readback() to authenticated;commit;", "postgres")
    assert MANIFEST["installationMode"] == "retained"
    # Install independent capture first through the exact canonical transaction.
    # Actual encrypted synthetic evidence is then retained/sealed before commerce.
    sql((SOURCE / MANIFEST["captureBootstrapMigration"]).read_text(), "postgres")
    fixture = Path(__file__).resolve().parent.parent
    environment = {**STACK.env, "NODE_PATH": json.loads((fixture / "local-runtime.json").read_text())["nodeModulesPath"]}
    prepared = subprocess.run(["node", str(fixture / "capture-seed.mjs")], capture_output=True, text=True, timeout=20, env=environment)
    assert prepared.returncode == 0, STACK.redact(prepared.stderr)
    history = json.loads(prepared.stdout)
    for command in ["configure", "start", "ingest", "seal"]:
        output = sql(history[command])
        if command == "ingest":
            acknowledgement = json.loads(output)
            assert acknowledgement["status"] == "captured" and acknowledgement["durable"] is True
    assert sql("select phase from rc_qualification_capture_v1.test_store_qualification_controls;") == "sealed"
    assert sql("select count(*) from rc_qualification_capture_v1.test_store_qualification_entries;") == "1"
    capture_tables = ["project_reservations", "test_store_qualification_connections", "test_store_qualification_controls",
        "test_store_qualification_entries", "test_store_qualification_deliveries", "test_store_qualification_exclusions", "test_store_qualification_conflicts"]
    def capture_fingerprint():
        # Local fixture-owned rows only; proof retains a hash, never receipt data.
        parts = []
        for table in capture_tables:
            parts.append(sql("select coalesce(jsonb_agg(row_value order by row_value::text),'[]'::jsonb) from (select to_jsonb(t) row_value from rc_qualification_capture_v1." + table + " t) x;"))
        return hashlib.sha256("\n".join(parts).encode()).hexdigest()
    retained_fingerprint = capture_fingerprint()
    bundle = "\n".join((SOURCE / name).read_text() for name in MANIFEST["orderedModules"])
    revoke = (SOURCE / 'paid-video-install-revoke-v2.sql').read_text()
    position = bundle.rfind(revoke); assert position >= 0
    incomplete = bundle[:position] + bundle[position + len(revoke):]
    rejected = False
    try: sql('begin;' + incomplete + 'commit;', 'postgres')
    except RuntimeError as error: rejected = 'paid_video_install_finalization_required' in str(error)
    assert rejected, 'Incomplete privilege finalization must abort the actual non-superuser install'
    assert sql("select count(*) from pg_namespace where nspname='sandbox_commerce_v1';") == '0'
    assert sql("select count(*) from pg_roles where rolname='sbx_v1_core_owner';") == '0'
    assert capture_fingerprint() == retained_fingerprint
    sql("begin;" + bundle + "commit;", "postgres")
    assert capture_fingerprint() == retained_fingerprint
    assert sql("select has_schema_privilege('sbx_v1_core_owner','public','CREATE');") == 'f'
    STACK.write_public('install-permission-proof.json', {'actualInstaller': 'postgres', 'installerIsSuperuser': sql("select rolsuper from pg_roles where rolname='postgres';") == 't',
      'omittedFinalRevokeAbortedCommit': rejected, 'failedInstallRolledBackFreshSchemaAndRoles': True, 'finalPublicCreatePrivilege': False, 'retainedCapture': {'phase':'sealed','entries':1,'ownedTables':7,'beforeAndAfterSha256':retained_fingerprint,'rollbackPreserved':True,'successfulInstallPreserved':True}})
    sql("notify pgrst,'reload schema';")
    record = json.loads(sql("select json_build_object('postgresRole',(select json_build_object('super',rolsuper,'createrole',rolcreaterole,'bypassrls',rolbypassrls,'inherit',rolinherit) from pg_roles where rolname='postgres'),'authUsers',(select count(*) from auth.users),'generation',(select state from sandbox_commerce_v1.lifecycle),'providerRoutes',(select count(*) from sandbox_commerce_v1.provider_routes),'version',current_setting('server_version'));"))
    assert record["generation"] == "disabled" and record["authUsers"] == 0 and record["providerRoutes"] == 0
    (ROOT / "install-proof.json").write_text(json.dumps({"sourceManifest": MANIFEST, "observedLocalState": record, "syntheticPublicTables": tables, "authFixtureExecuted": False,
        "sharedAuthorityDefinitions": "Three exact unchanged repository function definitions; separate frozen source hashes; whole migration files not executed",
        "syntheticAccountProjectionColumnsAdded": ["restore_deadline", "delete_after"],
        "v2Defaults": json.loads(sql("select json_build_object('connections',(select count(*) from sandbox_commerce_v1.test_store_v2_connections),'qualificationPhase',(select phase from sandbox_commerce_v1.test_store_qualification_controls),'qualificationEntries',(select count(*) from sandbox_commerce_v1.test_store_qualification_entries));"))}, indent=2) + "\n")
    print("Retained sealed capture and exact 42-module commerce installed through actual local non-superuser postgres; Auth remains official and empty")

def accounts():
    assert not (ROOT / "accounts.private.json").exists()
    result = {}
    for name in ["buyer", "creator"]:
        password = secrets.token_urlsafe(24)
        status, body, _ = http("/auth/v1/signup", data={"email": name + "@fixture.invalid", "password": password,
            "data": {"premium": True, "role": "creator", "fixtureOnly": True}})
        assert status == 200 and body.get("access_token"), (name, status, body.get("msg", body.get("message")))
        token = body["access_token"]; value = claims(token)
        assert value["role"] == "authenticated" and value.get("session_id")
        result[name] = {"userId": value["sub"], "sessionId": value["session_id"], "token": token, "refreshToken": body["refresh_token"], "password": password, "email": name + "@fixture.invalid"}
        private_write("accounts.private.json", result)
        assert http("/auth/v1/user", token)[0] == 200
    rows = json.loads(sql("select json_agg(json_build_object('id',id,'userId',user_id)) from auth.sessions;"))
    assert all(any(row["id"] == account["sessionId"] and row["userId"] == account["userId"] for row in rows) for account in result.values())
    sql("insert into public.wave1_legal_document_versions select k,c,true,'UNITED_STATES','1',clock_timestamp()-interval '1 day' from (values('terms','account'),('privacy','account'),('community_guidelines','account'),('creator_terms','creator'),('money_terms','creator_money')) v(k,c); insert into public.platform_money_kill_switches values('live_money_enabled','off'),('payouts_enabled','off'),('cashout_enabled','off');")
    for account in result.values():
        sql("insert into public.wave1_legal_acceptances select " + quote(account["userId"]) + "," + quote(account["sessionId"]) + ",document_key,version,market,capability,'member',null from public.wave1_legal_document_versions;")
    (ROOT / "auth-issuance-proof.json").write_text(json.dumps({"accountsCreatedBy": "actual local GoTrue signup HTTP API", "tokensVerifiedBy": "actual local GoTrue user HTTP API", "sessionClaimsMatchedOfficialAuthRows": True, "accounts": 2, "userMetadataContainsUntrustedPremiumClaim": True}, indent=2) + "\n")
    print("Two actual Auth accounts and sessions issued and verified; only legal/money facts were seeded")

def close_sessions():
    actors = []
    for name in ["accounts.private.json", "qualification-state.private.json"]:
        file = ROOT / name
        if not file.exists(): continue
        value = json.loads(file.read_text())
        if name == "accounts.private.json": actors.extend(value.values())
        elif value.get("buyerSecondSession"): actors.append(value["buyerSecondSession"])
    tokens = {actor["token"] for actor in actors if isinstance(actor, dict) and actor.get("token")}
    for token in tokens:
        status, _, _ = http("/auth/v1/logout?scope=local", token, method="POST")
        assert status in (200, 204, 401, 403)
    remaining = int(sql("select count(*) from auth.sessions;"))
    assert remaining == 0
    STACK.write_public("pre-cleanup-proof.json", {"authSessionsRemaining": remaining, "logoutAttemptCount": len(tokens)})
