export type AdminNavigationTab<Key extends string> = { key: Key; label: string };

// Navigation only consumes already-authorized tabs. A visible child never grants
// permission to its parent panel or to a sibling.
export function buildAdminNavigation<Key extends string>(
  visibleTabs: readonly AdminNavigationTab<Key>[],
  mainKeys: readonly Key[],
  labels: Partial<Record<Key, string>>,
  groups: Partial<Record<Key, Key>>,
  selectedTab: Key,
) {
  const groupOf = (key: Key) => groups[key] ?? key;
  const mainTabs = mainKeys.flatMap((key) => {
    const children = visibleTabs.filter((tab) => groupOf(tab.key) === key);
    if (!children.length) return [];
    const destination = children.find((tab) => tab.key === key) ?? children[0];
    return [{ key, label: labels[key] ?? visibleTabs.find((tab) => tab.key === key)?.label ?? key, destination: destination.key }];
  });
  const activeMainKey = groupOf(selectedTab);
  const secondaryTabs = visibleTabs.filter((tab) => groupOf(tab.key) === activeMainKey);
  return { mainTabs, secondaryTabs, activeMainKey };
}

export function getAdminContentInsets(insets: { top: number; right: number; bottom: number; left: number }) {
  return {
    paddingTop: Math.max(18, insets.top + 12),
    paddingBottom: Math.max(44, insets.bottom + 24),
    paddingLeft: insets.left + 18,
    paddingRight: insets.right + 18,
  };
}
