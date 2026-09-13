export type AccountScopedStringStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
};

const ACCOUNT_SCOPED_STORAGE_VERSION = "account-v1";
const ANONYMOUS_STORAGE_SUBJECT = "anonymous";

const normalizeSubject = (userId?: string | null) => (
  String(userId ?? "").trim() || ANONYMOUS_STORAGE_SUBJECT
);

export const getAccountScopedStorageKey = (baseKey: string, userId?: string | null) => (
  `${baseKey}:${ACCOUNT_SCOPED_STORAGE_VERSION}:${encodeURIComponent(normalizeSubject(userId))}`
);

const parseStoredJson = <T>(raw: string | null, fallback: T): T => {
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

export async function readAccountScopedJsonValue<T>(
  storage: AccountScopedStringStorage,
  baseKey: string,
  userId: string | null | undefined,
  fallback: T,
): Promise<T> {
  const subject = normalizeSubject(userId);
  const scopedKey = getAccountScopedStorageKey(baseKey, subject);
  try {
    return parseStoredJson(await storage.getItem(scopedKey), fallback);
  } catch {
    return fallback;
  }
}

export async function writeAccountScopedJsonValue(
  storage: AccountScopedStringStorage,
  baseKey: string,
  userId: string | null | undefined,
  value: unknown,
): Promise<boolean> {
  try {
    await storage.setItem(getAccountScopedStorageKey(baseKey, userId), JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
