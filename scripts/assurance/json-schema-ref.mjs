export function resolveLocalJsonPointer(root, ref) {
  if (typeof ref !== "string" || !ref.startsWith("#/")) return null;

  let current = root;
  for (const encodedToken of ref.slice(2).split("/")) {
    const token = encodedToken.replaceAll("~1", "/").replaceAll("~0", "~");
    if (!current || typeof current !== "object" || !Object.hasOwn(current, token)) return null;
    current = current[token];
  }
  return current;
}

function canonicalJsonValue(value) {
  if (Array.isArray(value)) return value.map(canonicalJsonValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalJsonValue(child)]),
    );
  }
  return value;
}

export function jsonSchemaConstEqual(left, right) {
  return JSON.stringify(canonicalJsonValue(left)) === JSON.stringify(canonicalJsonValue(right));
}
