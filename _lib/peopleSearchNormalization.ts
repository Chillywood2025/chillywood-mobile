const toText = (value: unknown) => String(value ?? "").trim();

const dedupe = (values: string[]) => Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));

const stripLeadingHandlePrefix = (value: string) => value.replace(/^@+/, "");

const cleanSearchText = (value: string) =>
  stripLeadingHandlePrefix(value)
    .toLowerCase()
    .replace(/[^a-z0-9 ._-]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[ ._-]+|[ ._-]+$/g, "");

const compactSearchText = (value: string) => value.replace(/[^a-z0-9]+/g, "");

const displaySearchText = (value: string) =>
  value
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const separatorVariants = (value: string) => {
  const normalized = value.replace(/[ ._-]+/g, " ").trim();
  if (!normalized.includes(" ")) return [];
  return [
    normalized,
    normalized.replace(/\s+/g, ""),
    normalized.replace(/\s+/g, "."),
    normalized.replace(/\s+/g, "_"),
    normalized.replace(/\s+/g, "-"),
  ];
};

const alphaNumberBoundaryVariants = (compact: string) => {
  if (!/[a-z][0-9]/.test(compact)) return [];
  return [
    compact.replace(/([a-z])([0-9])/g, "$1 $2"),
    compact.replace(/([a-z])([0-9])/g, "$1.$2"),
    compact.replace(/([a-z])([0-9])/g, "$1_$2"),
    compact.replace(/([a-z])([0-9])/g, "$1-$2"),
  ];
};

export type PeopleSearchNormalization = {
  original: string;
  cleaned: string;
  compact: string;
  display: string;
  candidates: string[];
  searchable: boolean;
  blocked: boolean;
};

export function normalizePeopleSearchQuery(value: unknown): PeopleSearchNormalization {
  const original = toText(value);
  const queryWithoutHandlePrefix = original.replace(/^@+/, "");
  const blocked = queryWithoutHandlePrefix.includes("@");
  const cleaned = cleanSearchText(original);
  const compact = compactSearchText(cleaned);
  const display = displaySearchText(cleaned);
  const candidates = blocked
    ? []
    : dedupe([
      cleaned,
      display,
      compact,
      ...separatorVariants(cleaned),
      ...alphaNumberBoundaryVariants(compact),
    ]).filter((candidate) => candidate.length >= 2);

  return {
    original,
    cleaned,
    compact,
    display,
    candidates,
    searchable: candidates.length > 0,
    blocked,
  };
}

export function getPrimaryPeopleSearchCandidate(value: unknown) {
  const normalized = normalizePeopleSearchQuery(value);
  return normalized.candidates[0] ?? "";
}

export function matchesPeopleSearchValues(values: unknown[], query: unknown) {
  const normalizedQuery = normalizePeopleSearchQuery(query);
  if (!normalizedQuery.searchable) return true;

  const needles = normalizedQuery.candidates;
  const haystacks = dedupe(values.flatMap((value) => {
    const normalizedValue = normalizePeopleSearchQuery(value);
    return [
      normalizedValue.cleaned,
      normalizedValue.display,
      normalizedValue.compact,
      ...normalizedValue.candidates,
    ];
  }));

  return haystacks.some((haystack) => needles.some((needle) => haystack.includes(needle)));
}

export function rankPeopleSearchValues(query: unknown, values: unknown[]) {
  const normalizedQuery = normalizePeopleSearchQuery(query);
  if (!normalizedQuery.searchable) return 99;

  const needles = normalizedQuery.candidates;
  const haystacks = dedupe(values.flatMap((value) => {
    const normalizedValue = normalizePeopleSearchQuery(value);
    return [
      normalizedValue.cleaned,
      normalizedValue.display,
      normalizedValue.compact,
      ...normalizedValue.candidates,
    ];
  }));

  return haystacks.reduce((best, haystack) => {
    for (const needle of needles) {
      if (haystack === needle) best = Math.min(best, 0);
      else if (haystack.startsWith(needle)) best = Math.min(best, 1);
      else if (haystack.includes(needle)) best = Math.min(best, 2);
    }
    return best;
  }, 99);
}

export const PEOPLE_SEARCH_NO_RESULTS_COPY =
  "No public profile found for that search. Try the full handle or display name.";
