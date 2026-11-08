#!/usr/bin/env python3
"""Materialize an exact private local fixture; never starts services or networks."""
import argparse, hashlib, json, os, shutil, subprocess
from pathlib import Path

HERE = Path(__file__).resolve().parent
TREE = "5e9b8f86792c2fab606ed216037aec916f094b7c"
PUBLISHED = "0d1d3b3a959295dfc44a6485ab8f7067d933bb43"

def digest(raw):
    return hashlib.sha256(raw).hexdigest()

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--deno", type=Path, required=True)
    args = parser.parse_args()
    repo, output, deno = args.repo.resolve(), args.output.resolve(), args.deno.resolve()
    assert not output.exists(), "Output must be a new private directory"
    assert output != repo and repo not in output.parents, "Runtime credentials must stay outside the checkout"
    assert deno.is_file() and os.access(deno, os.X_OK), "Explicit local Deno binary required"
    assert (repo / "node_modules/typescript/package.json").is_file(), "Install the pinned repository dependencies first"
    assert subprocess.check_output(["git", "cat-file", "-t", TREE], cwd=repo, text=True).strip() == "tree", "Fetch the published baseline tree first"
    manifest = json.loads((HERE / "manifest.json").read_text())
    assert manifest["baselineTree"] == TREE
    package = json.loads((HERE / "source-manifest.json").read_text())
    for name, expected in package["files"].items():
        assert digest((HERE / name).read_bytes()) == expected, "Template hash mismatch: " + name
    sources = {}
    for name, expected in manifest["files"].items():
        assert not Path(name).is_absolute() and ".." not in Path(name).parts
        if name in manifest["baselineGitBlobs"]:
            blob = subprocess.check_output(["git", "rev-parse", TREE + ":" + name], cwd=repo, text=True).strip()
            assert blob == manifest["baselineGitBlobs"][name], "Baseline blob mismatch"
            raw = subprocess.check_output(["git", "show", TREE + ":" + name], cwd=repo)
        else:
            raw = (repo / name).read_bytes()
        assert digest(raw) == expected["sha256"] and len(raw) == expected["bytes"], "Source hash mismatch: " + name
        sources[name] = raw
    output.mkdir(mode=0o700)
    for name in package["files"]:
        if name in ("prepare.py", "README.md"):
            continue
        target = output / name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(HERE / name, target)
    for name, raw in sources.items():
        target = output / "snapshot" / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(raw)
    local = {"denoBinary": str(deno), "nodeModulesPath": str(repo / "node_modules")}
    (output / "local-runtime.json").write_text(json.dumps(local, indent=2) + "\n")
    files = sorted(str(p.relative_to(output)) for p in output.rglob("*") if p.is_file())
    hashes = {name: digest((output / name).read_bytes()) for name in files}
    (output / "execution-inputs.json").write_text(json.dumps(hashes, indent=2) + "\n")
    print(json.dumps({"prepared": str(output), "source": manifest["source"], "files": len(hashes),
        "baselineTree": TREE, "publishedBaseline": PUBLISHED, "servicesStarted": False,
        "executionInputsSha256": digest((output / "execution-inputs.json").read_bytes())}))

if __name__ == "__main__":
    main()
