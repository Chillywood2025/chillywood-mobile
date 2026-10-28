/** Leading/trailing automatic hints, not a result cache. Confirmed actions and
 * explicit reads bypass this budget at the consumer. */
export function createNotificationHintBudget(deliver: () => void, windowMs = 5_000) {
  let lastDelivery: number | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let retired = false;
  return {
    hint() {
      if (retired) return;
      const remaining = lastDelivery === null ? 0 : windowMs - (Date.now() - lastDelivery);
      if (remaining <= 0) {
        if (timer) clearTimeout(timer);
        timer = null;
        lastDelivery = Date.now();
        deliver();
      } else if (!timer) {
        timer = setTimeout(() => {
          timer = null;
          if (retired) return;
          lastDelivery = Date.now();
          deliver();
        }, remaining);
      }
    },
    stop() {
      retired = true;
      if (timer) clearTimeout(timer);
      timer = null;
    },
  };
}
