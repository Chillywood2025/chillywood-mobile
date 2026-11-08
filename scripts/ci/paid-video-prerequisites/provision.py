#!/usr/bin/env python3
"""Prepare public, pinned dependencies on a fresh GitHub Ubuntu runner only.

This is not a production installer. It never accepts a project or credential.
No database signatures, downloaded binaries or runtime logs belong in Git.
"""
import argparse, hashlib, importlib.util, json, os, platform, pwd, re, shutil, subprocess, time
import urllib.parse, urllib.request, zipfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
PINS = json.loads((HERE / "pins.json").read_text())
DOWNLOAD_HOSTS = {"github.com", "release-assets.githubusercontent.com", "raw.githubusercontent.com", "objects.githubusercontent.com"}

def sha(path):
    value = hashlib.sha256()
    with Path(path).open("rb") as stream:
        while chunk := stream.read(1024 * 1024):
            value.update(chunk)
    return value.hexdigest()

def run(args, *, env=None, timeout=120):
    result = subprocess.run(args, capture_output=True, text=True, env=env, timeout=timeout)
    if result.returncode:
        raise RuntimeError("Dependency command failed: " + Path(args[0]).name + ": " + result.stderr[-3000:])
    return result.stdout

def validate_download_url(url):
    parsed = urllib.parse.urlsplit(url)
    if parsed.scheme != "https" or parsed.hostname not in DOWNLOAD_HOSTS or parsed.username or parsed.password or parsed.port:
        raise ValueError("Unapproved public dependency URL")

class OfficialRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, response, code, message, headers, newurl):
        validate_download_url(newurl)
        return super().redirect_request(request, response, code, message, headers, newurl)

def download(pin, target, opener=None):
    """One request chain, exact bytes/hash; never a stale or unverified fallback."""
    validate_download_url(pin["url"])
    opener = opener or urllib.request.build_opener(urllib.request.ProxyHandler({}), OfficialRedirect())
    temporary = target.with_suffix(target.suffix + ".partial")
    deadline = time.monotonic() + 180
    try:
        with opener.open(pin["url"], timeout=45) as response, temporary.open("xb") as output:
            validate_download_url(response.geturl())
            total = 0
            while chunk := response.read1(1024 * 1024):
                if time.monotonic() >= deadline: raise TimeoutError("Dependency download deadline exceeded")
                total += len(chunk)
                if total > pin["bytes"]:
                    raise ValueError("Dependency exceeded pinned byte length")
                output.write(chunk)
        if total != pin["bytes"] or sha(temporary) != pin["sha256"]:
            raise ValueError("Dependency byte/hash mismatch")
        temporary.replace(target)
    finally:
        temporary.unlink(missing_ok=True)

def parse_os_release(text):
    return dict(line.split("=", 1) for line in text.splitlines() if "=" in line and not line.startswith("#"))

def assert_host(env, system, machine, os_release, uid):
    values = {k: v.strip('"') for k, v in parse_os_release(os_release).items()}
    if (env.get("GITHUB_ACTIONS") != "true" or env.get("RUNNER_ENVIRONMENT") != "github-hosted" or env.get("RUNNER_OS") != "Linux" or system != "Linux"
        or machine != "x86_64" or values.get("ID") != "ubuntu" or values.get("VERSION_ID") != "24.04" or uid == 0):
        raise ValueError("Only an unprivileged GitHub Ubuntu 24.04 amd64 job is supported")
    if any(env.get(k) for k in ("DOCKER_HOST", "DOCKER_TLS_VERIFY", "DOCKER_CERT_PATH", "DOCKER_CONTEXT", "DENO_DIR")):
        raise ValueError("Remote Docker overrides or a non-default Deno cache are forbidden")

def freshclam_config(directory, certificates, owner):
    for value in (str(directory), str(certificates), owner):
        if not re.fullmatch(r"[A-Za-z0-9_./-]+", value):
            raise ValueError("FreshClam configuration path/owner must be unambiguous")
    return "\n".join(["DatabaseDirectory " + str(directory), "DatabaseOwner " + owner,
        "DatabaseMirror database.clamav.net", "CVDCertsDirectory " + str(certificates),
        "TestDatabases yes", "MaxAttempts 1", "ConnectTimeout 20", "ReceiveTimeout 180",
        "Bytecode yes", "ScriptedUpdates no", "LogTime yes", ""])

def verify_gpg_status(status, expected):
    valid = [line.split() for line in status.splitlines() if line.startswith("[GNUPG:] VALIDSIG ")]
    if len(valid) != 1 or expected not in (valid[0][2], valid[0][-1]):
        raise ValueError("Official package signature did not match the pinned Talos key")
    if any("[GNUPG:] " + bad in status for bad in ("BADSIG", "ERRSIG", "EXPKEYSIG", "REVKEYSIG", "EXPSIG")):
        raise ValueError("Package signature is invalid, expired or revoked")

def require_git_baselines(repo):
    for pin in PINS["publishedBaselines"]:
        actual = run(["git", "rev-parse", pin["commit"] + "^{tree}"], timeout=30, env={**os.environ, "GIT_DIR": str(repo / ".git")}).strip()
        if actual != pin["tree"]:
            raise ValueError("Published baseline tree mismatch; checkout with fetch-depth: 0")

def provision(repo, output):
    assert_host(os.environ, platform.system(), platform.machine(), Path("/etc/os-release").read_text(), os.geteuid())
    if output.exists() or output == repo or repo in output.parents:
        raise ValueError("Use a fresh private output directory outside the checkout")
    require_git_baselines(repo)
    output.mkdir(mode=0o700, parents=True)
    report = {"protocol": "scpv-hosted-prerequisite-proof-v1", "status": "incomplete", "pinsSha256": sha(HERE / "pins.json"), "steps": []}
    def record(step, **detail):
        report["steps"].append({"step": step, **detail})
        (output / "prerequisite-proof.json").write_text(json.dumps(report, indent=2) + "\n")
    # Apt retains its signed archive metadata verification. No --allow-unauthenticated.
    run(["sudo", "apt-get", "update"], timeout=240)
    run(["sudo", "apt-get", "install", "--no-install-recommends", "-y", "ca-certificates", "gnupg", "ffmpeg=" + PINS["ffmpegPackageVersion"]], timeout=240)
    actual = run(["dpkg-query", "-W", "-f=${Version}", "ffmpeg"]).strip()
    if actual != PINS["ffmpegPackageVersion"]:
        raise ValueError("FFmpeg package version mismatch")
    record("signed-ubuntu-ffmpeg", version=actual)
    downloads = output / "downloads"; downloads.mkdir(mode=0o700)
    paths = {}
    for name in ("clamav", "signature", "talosKey", "deno"):
        paths[name] = downloads / Path(urllib.parse.urlsplit(PINS[name]["url"]).path).name
        download(PINS[name], paths[name])
    gpg = output / "gpg"; gpg.mkdir(mode=0o700)
    base = ["gpg", "--batch", "--no-auto-key-retrieve", "--homedir", str(gpg)]
    run(base + ["--import", str(paths["talosKey"])])
    listing = run(base + ["--with-colons", "--fingerprint", "--list-keys"])
    primary = []; next_primary = False
    for line in listing.splitlines():
        if line.startswith("pub:"): next_primary = True
        elif line.startswith("fpr:") and next_primary: primary.append(line.split(":")[9]); next_primary = False
    if primary != [PINS["talosKey"]["fingerprint"]]:
        raise ValueError("Unexpected package-verification key set")
    status = run(base + ["--status-fd", "1", "--verify", str(paths["signature"]), str(paths["clamav"])])
    verify_gpg_status(status, PINS["talosKey"]["fingerprint"])
    # This official package has no daemon configuration; scope is ephemeral CI.
    run(["sudo", "dpkg", "--install", str(paths["clamav"])], timeout=180)
    certificates = Path("/usr/local/etc/certs")
    if not (certificates / "clamav.crt").is_file():
        raise ValueError("Signed package CVD trust certificate missing")
    for name in ("clamscan", "sigtool"):
        if not run(["/usr/local/bin/" + name, "--version"]).startswith("ClamAV " + PINS["clamavVersion"]):
            raise ValueError("Installed ClamAV version mismatch")
    if "cvdcertsdir" not in run(["/usr/local/bin/sigtool", "--help"]):
        raise ValueError("Required external CVD certificate verification unsupported")
    for name in ("ffmpeg", "ffprobe"):
        link = Path("/usr/local/bin") / name
        if link.exists() or link.is_symlink():
            if link.resolve() != Path("/usr/bin") / name:
                raise ValueError("Refusing to replace existing " + str(link))
        else:
            run(["sudo", "ln", "-s", "/usr/bin/" + name, str(link)])
    record("official-clamav", version=PINS["clamavVersion"], signatureVerified=True, certificateSha256=sha(certificates / "clamav.crt"))
    binary = output / "deno"
    with zipfile.ZipFile(paths["deno"]) as archive:
        if archive.namelist() != ["deno"] or archive.getinfo("deno").file_size > 250 * 1024 * 1024:
            raise ValueError("Unexpected Deno archive layout")
        with archive.open("deno") as source, binary.open("xb") as target: shutil.copyfileobj(source, target)
    binary.chmod(0o700)
    if not run([str(binary), "--version"]).startswith("deno " + PINS["denoVersion"] + " "):
        raise ValueError("Deno version mismatch")
    # The production harness intentionally discards DENO_DIR. Warm only its
    # default cache as the same unprivileged user, with the exact frozen lock.
    fixture = output / "http-fixture"
    run(["python3", str(repo / PINS["httpPrepare"]), "--repo", str(repo), "--output", str(fixture), "--deno", str(binary)])
    lock = fixture / "deno.lock"; lock_before = sha(lock)
    environment = {**os.environ, "DENO_NO_PACKAGE_JSON": "1"}
    run([str(binary), "cache", "--no-config", "--node-modules-dir=none", "--frozen", "--lock=" + str(lock), str(fixture / "listener.ts")], env=environment, timeout=180)
    if sha(lock) != lock_before: raise ValueError("Deno lock changed")
    record("deno-cache", version=PINS["denoVersion"], lockSha256=lock_before)
    profile = json.loads((repo / PINS["httpProfile"]).read_text())
    context = run(["docker", "context", "show"]).strip()
    docker_context = json.loads(run(["docker", "context", "inspect", context]))[0]
    endpoint = docker_context["Endpoints"]["docker"]["Host"]
    parsed = urllib.parse.urlsplit(endpoint)
    if parsed.scheme != "unix" or parsed.netloc or not parsed.path.startswith("/") or parsed.query or parsed.fragment:
        raise ValueError("Only a local Unix Docker socket is allowed")
    registry_config = output / "public-docker-config"; registry_config.mkdir(mode=0o700)
    (registry_config / "config.json").write_text("{}\n")
    docker = ["docker", "--config", str(registry_config), "--host", endpoint]
    module_spec = importlib.util.spec_from_file_location("scpv_image_chain", repo / PINS["imageValidator"])
    validator = importlib.util.module_from_spec(module_spec); module_spec.loader.exec_module(validator)
    image_pins = json.loads((repo / PINS["imageChains"]).read_text())
    if image_pins["protocol"] != "scpv-public-image-chain-pins-v1" or set(image_pins["images"]) != set(profile["images"]):
        raise ValueError("Image chain pin set mismatch")
    for name, image in profile["images"].items():
        if not re.fullmatch(r"public\.ecr\.aws/supabase/[a-z]+@sha256:[a-f0-9]{64}", image):
            raise ValueError("Unpinned fixture image")
        run(docker + ["pull", "--platform", "linux/amd64", image], timeout=240)
        observed = json.loads(run(docker + ["image", "inspect", image]))[0]
        chain = validator.validate_image(image_pins["images"][name], image, observed)
        record("cached-image", name=name, image=image, imageId=observed["Id"], chain=chain)
    database = output / "database"; database.mkdir(mode=0o700)
    config = output / "freshclam.conf"
    config.write_text(freshclam_config(database, certificates, pwd.getpwuid(os.getuid()).pw_name))
    if not run(["/usr/local/bin/freshclam", "--config-file=" + str(config), "--version"]).startswith("ClamAV " + PINS["clamavVersion"]):
        raise ValueError("FreshClam version/configuration mismatch")
    # The only supported public signature downloader. One invocation, no custom
    # curl/wget CVD fetch, no mirror switching and no retry after CDN rejection.
    run(["/usr/local/bin/freshclam", "--config-file=" + str(config), "--stdout"], timeout=600)
    check = "const m=await import(process.argv[1]);console.log(JSON.stringify(await m.inspectDefinitions({directory:process.argv[2],certificateDirectory:process.argv[3],sigtool:'/usr/local/bin/sigtool'})));"
    definitions = json.loads(run(["node", "--input-type=module", "-e", check, (repo / "ops/isolated-paid-video-worker/scan.mjs").as_uri(), str(database), str(certificates)], timeout=120))
    record("fresh-signed-definitions", evidence=definitions)
    tools = {}
    for name in ("ffmpeg", "ffprobe", "clamscan", "sigtool"):
        path = Path("/usr/local/bin") / name
        tools[name] = {"sha256": sha(path), "version": run([str(path), "-version" if name.startswith("ff") else "--version"]).splitlines()[0]}
    report.update(status="ready-for-local-fixture-tests", database=str(database), certificates=str(certificates), deno=str(binary), httpFixture=str(fixture), tools=tools,
        hostedIntegrationPassed=False, liveMoneyEnabled=False)
    (output / "prerequisite-proof.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({key: report[key] for key in ("status", "database", "certificates", "deno", "httpFixture")}))

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--plan", action="store_true")
    parser.add_argument("--repo", type=Path)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    if args.plan:
        print(json.dumps(PINS, indent=2)); return
    if args.repo is None or args.output is None: parser.error("--repo and --output are required")
    provision(args.repo.resolve(), args.output.resolve())

if __name__ == "__main__":
    main()
