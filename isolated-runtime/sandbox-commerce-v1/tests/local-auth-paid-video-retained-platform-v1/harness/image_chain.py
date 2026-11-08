"""Exact public OCI/Docker index -> linux/amd64 manifest -> config validation."""
import hashlib, json, re

INDEX_TYPES = {"application/vnd.oci.image.index.v1+json", "application/vnd.docker.distribution.manifest.list.v2+json"}
MANIFEST_TYPES = {"application/vnd.oci.image.manifest.v1+json", "application/vnd.docker.distribution.manifest.v2+json"}
CONFIG_TYPES = {"application/vnd.oci.image.config.v1+json", "application/vnd.docker.container.image.v1+json"}

def require(value, message):
    if not value: raise ValueError(message)

def raw_object(item):
    require(isinstance(item,dict) and set(item)=={"digest","raw"}, "Exact metadata object required")
    require(isinstance(item["raw"],str) and len(item["raw"].encode())<=2*1024*1024, "Bounded raw metadata required")
    require(item["digest"] == "sha256:" + hashlib.sha256(item["raw"].encode()).hexdigest(), "Raw image metadata digest mismatch")
    value=json.loads(item["raw"])
    require(isinstance(value,dict), "Image metadata must be an object")
    return value

def verify_chain(pin, reference):
    require(set(pin)=={"reference","index","platformManifest","config"}, "Unknown image-chain field")
    require(pin["reference"]==reference and re.fullmatch(r"public\.ecr\.aws/supabase/[a-z]+@sha256:[a-f0-9]{64}",reference), "Exact pinned reference required")
    index=raw_object(pin["index"]); manifest=raw_object(pin["platformManifest"]); config=raw_object(pin["config"])
    require(reference.split("@")[1]==pin["index"]["digest"], "Reference/index mismatch")
    require(index.get("schemaVersion")==2 and index.get("mediaType") in INDEX_TYPES, "Unsupported index format")
    require(isinstance(index.get("manifests"),list), "Index descriptors missing")
    selected=[m for m in index["manifests"] if m.get("platform",{}).get("os")=="linux"
        and m.get("platform",{}).get("architecture")=="amd64" and not m.get("platform",{}).get("variant")]
    require(len(selected)==1, "Exactly one Linux/amd64 descriptor required")
    descriptor=selected[0]
    require(descriptor.get("digest")==pin["platformManifest"]["digest"] and descriptor.get("size")==len(pin["platformManifest"]["raw"].encode()), "Platform descriptor binding mismatch")
    require(descriptor.get("mediaType") in MANIFEST_TYPES and manifest.get("mediaType")==descriptor["mediaType"] and manifest.get("schemaVersion")==2, "Unsupported platform manifest")
    cfg=manifest.get("config",{})
    require(cfg.get("mediaType") in CONFIG_TYPES and cfg.get("digest")==pin["config"]["digest"] and cfg.get("size")==len(pin["config"]["raw"].encode()), "Config descriptor binding mismatch")
    require(config.get("os")=="linux" and config.get("architecture")=="amd64" and not config.get("variant"), "Config platform mismatch")
    rootfs=config.get("rootfs",{})
    require(rootfs.get("type")=="layers" and isinstance(rootfs.get("diff_ids"),list) and rootfs["diff_ids"], "Layer identities required")
    require(all(isinstance(x,str) and re.fullmatch(r"sha256:[a-f0-9]{64}",x) for x in rootfs["diff_ids"]), "Invalid rootfs digest")
    layers=manifest.get("layers",[])
    require(len(layers)==len(rootfs["diff_ids"]), "Layer count mismatch")
    require(all(isinstance(v,dict) and re.fullmatch(r"sha256:[a-f0-9]{64}",v.get("digest","")) and isinstance(v.get("size"),int) and v["size"]>=0 for v in layers), "Invalid layer descriptors")
    return {"reference":reference,"indexDigest":pin["index"]["digest"],"manifestDigest":pin["platformManifest"]["digest"],
        "configDigest":pin["config"]["digest"],"rootfsDiffIds":rootfs["diff_ids"],"os":"linux","architecture":"amd64"}

def validate_image(pin, reference, observed):
    chain=verify_chain(pin,reference)
    require(reference in observed.get("RepoDigests",[]), "Daemon lacks exact pinned index reference")
    require(observed.get("Id") in (chain["indexDigest"],chain["configDigest"]), "Daemon image identity is outside verified chain")
    require(observed.get("Os")=="linux" and observed.get("Architecture")=="amd64" and not observed.get("Variant"), "Daemon platform mismatch")
    require(observed.get("RootFS")=={"Type":"layers","Layers":chain["rootfsDiffIds"]}, "Daemon rootfs differs from verified config")
    return {k:v for k,v in chain.items() if k!="rootfsDiffIds"}
