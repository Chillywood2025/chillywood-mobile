type Resource = {
  cleanup: () => Promise<void>;
  retains: number;
  releaseRequested: boolean;
  cleanupStarted: boolean;
  uri?: string;
  members?: Resource[];
};
const resources = new WeakMap<object, Resource>();
// Exact URIs registered with a native-issued cleanup handle, never URI-prefix
// trust. Needed because native readers receive a pathname, not the file object.
const ownedUris = new Map<string, Resource>();

const cleanupWhenUnused = async (resource: Resource) => {
  if (!resource.releaseRequested || resource.retains || resource.cleanupStarted) return;
  resource.cleanupStarted = true;
  await Promise.resolve().then(resource.cleanup).catch(() => undefined);
  if (resource.uri && ownedUris.get(resource.uri) === resource) ownedUris.delete(resource.uri);
};

/** Keep native cache ownership attached to the actual selected file identity. */
export function ownPickedMedia(value: object, release: () => Promise<void>) {
  const uri = "uri" in value && typeof value.uri === "string" ? value.uri : undefined;
  const resource: Resource = { cleanup: release, retains: 0, releaseRequested: false, cleanupStarted: false, uri };
  resources.set(value, resource);
  if (uri) ownedUris.set(uri, resource);
}

const retainResources = (entries: Iterable<Resource>) => {
  const held = new Set<Resource>();
  const collect = (resource: Resource) => {
    if (held.has(resource)) return;
    // An explicit send/recovery owner can hand off to its native reader after
    // the composer owner clears. Once no owner remains, do not revive it.
    if (resource.cleanupStarted || (resource.releaseRequested && !resource.retains)) throw new Error("This attachment selection is no longer available.");
    held.add(resource);
    resource.members?.forEach(collect);
  };
  for (const resource of entries) collect(resource);
  for (const resource of held) resource.retains++;
  let released = false;
  return async () => {
    if (released) return;
    released = true;
    for (const resource of held) resource.retains--;
    await Promise.all([...held].map(cleanupWhenUnused));
  };
};

/** Retain a staged/send/recovery/preview owner BEFORE clearing another owner.
 * Returned release is idempotent; only explicit collected groups/arrays are
 * visited, never arbitrary result properties.
 */
export function retainPickedMedia(value: unknown): () => void {
  const entries = new Set<Resource>();
  const collect = (item: unknown) => {
    if (!item || typeof item !== "object") return;
    const resource = resources.get(item);
    if (resource) entries.add(resource);
    if (Array.isArray(item)) item.forEach(collect);
  };
  collect(value);
  const release = retainResources(entries);
  return () => { void release(); };
}

/** Wrap the actual raw reader promise BEFORE any caller timeout/Promise.race.
 * A timeout is not proof that native stopped reading this pathname.
 */
export async function withPickedMediaRead<T>(uri: string, start: () => Promise<T>): Promise<T> {
  const resource = ownedUris.get(uri);
  if (!resource) return start();
  const release = retainResources([resource]);
  try { return await start(); }
  finally { await release(); }
}

/** A caller may wrap its file with an immutable mutation subject. Carry the
 * exact collected cleanup handles to that result without walking properties or
 * replacing a file's existing native cleanup.
 */
export function bindPickedMediaResult(value: unknown, owned: ReadonlySet<object>) {
  if (!value || typeof value !== "object" || !owned.size) return;
  const others = [...owned].filter((item) => item !== value);
  if (!others.length) return;
  const existing = resources.get(value);
  const existingCleanup = existing?.cleanup;
  const cleanup = async () => {
    await Promise.resolve().then(() => existingCleanup?.()).catch(() => undefined);
    await Promise.all(others.map(releasePickedMedia));
  };
  const members = others.flatMap((item) => { const entry = resources.get(item); return entry ? [entry] : []; });
  if (existing) { existing.cleanup = cleanup; existing.members = [...(existing.members ?? []), ...members]; }
  else resources.set(value, { cleanup, retains: 0, releaseRequested: false, cleanupStarted: false, members });
}

/** Safe after rejection, replacement, cancellation or confirmed consumption.
 * Never call while a draft/upload still needs the file. Unknown/provider files
 * are untouched; opaque native IDs, not arbitrary paths, authorize deletion.
 */
export async function releasePickedMedia(value: unknown): Promise<void> {
  if (!value || typeof value !== "object") return;
  const resource = resources.get(value);
  if (resource) {
    resource.releaseRequested = true;
    await cleanupWhenUnused(resource);
  }
  if (Array.isArray(value)) await Promise.all(value.map(releasePickedMedia));
}
