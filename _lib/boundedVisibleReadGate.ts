export type BoundedVisibleReadGate = {
  shouldRun: (visible: boolean) => boolean;
};

export function createBoundedVisibleReadGate(): BoundedVisibleReadGate {
  let open = false;

  return {
    shouldRun(visible: boolean) {
      if (!visible) {
        open = false;
        return false;
      }
      if (open) return false;
      open = true;
      return true;
    },
  };
}
