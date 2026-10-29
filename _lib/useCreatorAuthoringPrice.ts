import { useCallback, useEffect, useRef, useState } from "react";
import { getCurrentAccountSessionAuthoritySnapshot, sameAccountSessionAuthority } from "./accountSessionAuthority";
import { readCreatorAuthoringPrices, type CreatorPriceSourceType, type CreatorSupportedPrice } from "./creatorSupportedPrices";
import { useSession } from "./session";

// Keep author choices across retry, but never carry a catalog or selection into
// another account/source. The server validates the price again on every save.
export function useCreatorAuthoringPrice(sourceType: CreatorPriceSourceType, options: {
  sourceId?: string | null;
  preferredAmount?: number | null;
  enabled?: boolean;
} = {}) {
  const { user, authority } = useSession();
  const enabled = options.enabled !== false;
  const scope = `${user?.id ?? ""}:${sourceType}:${options.sourceId ?? ""}`;
  const generation = useRef(0);
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<{
    scope: string; authority: ReturnType<typeof getCurrentAccountSessionAuthoritySnapshot>;
    prices: CreatorSupportedPrice[]; selectedPriceKey: string | null; loading: boolean; error: string | null;
  }>({ scope: "", authority: null, prices: [], selectedPriceKey: null, loading: false, error: null });
  const preferredAmount = options.preferredAmount ?? null;
  useEffect(() => {
    const request = ++generation.current;
    const subject = getCurrentAccountSessionAuthoritySnapshot();
    if (!enabled || !user?.id || subject?.userId !== user.id || subject.state !== "ACTIVE" || subject.restoreOnly) return;
    const current = () => generation.current === request && sameAccountSessionAuthority(subject, getCurrentAccountSessionAuthoritySnapshot());
    setState(previous => ({ scope, authority: subject, prices: previous.scope === scope ? previous.prices : [],
      selectedPriceKey: previous.scope === scope ? previous.selectedPriceKey : null, loading: true, error: null }));
    void readCreatorAuthoringPrices(sourceType).then(result => {
      if (!current()) return;
      if (result.status !== "resolved" || result.subjectUserId !== subject.userId) throw new Error("catalog_unavailable");
      setState(previous => {
        const retained = result.prices.find(price => price.priceKey === previous.selectedPriceKey);
        const saved = result.prices.find(price => price.amountMinor === preferredAmount);
        return { scope, authority: subject, prices: result.prices,
          selectedPriceKey: (retained ?? saved ?? (result.prices.length === 1 ? result.prices[0] : null))?.priceKey ?? null,
          loading: false, error: null };
      });
    }).catch(() => {
      if (current()) setState(previous => ({ ...previous, loading: false,
        error: "Available prices could not load. Your selection is preserved. Refresh prices before saving paid access." }));
    });
    return () => { generation.current += 1; };
  }, [authority, enabled, preferredAmount, revision, scope, sourceType, user?.id]);
  const isCurrent = useCallback(() => enabled && state.scope === scope
    && sameAccountSessionAuthority(state.authority, getCurrentAccountSessionAuthoritySnapshot()), [enabled, scope, state.authority, state.scope]);
  const select = useCallback((price: CreatorSupportedPrice) => {
    if (!isCurrent() || state.loading || state.error || !state.prices.some(row => row.priceKey === price.priceKey)) return;
    setState(previous => ({ ...previous, selectedPriceKey: price.priceKey }));
  }, [isCurrent, state.error, state.loading, state.prices]);
  const current = isCurrent();
  return {
    prices: current ? state.prices : [], selectedPriceKey: current ? state.selectedPriceKey : null,
    selectedPrice: current && !state.loading && !state.error
      ? state.prices.find(price => price.priceKey === state.selectedPriceKey) ?? null : null,
    loading: enabled && (!current || state.loading), error: current ? state.error : null,
    select, refresh: () => setRevision(value => value + 1), isCurrent,
  };
}
