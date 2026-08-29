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
