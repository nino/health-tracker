import { useEffect, type EffectCallback } from "react";

/**
 * Runs `effect` once after the component mounts, and its cleanup once on
 * unmount. This is the escape hatch for the `useEffect` ban (see
 * eslint.config.js): anything that would need dependencies is derived
 * state, an event handler, or a component remounted with a `key`. To read
 * the latest props or state from inside, wrap the reader in
 * `useEffectEvent`.
 */
export function useMountEffect(effect: EffectCallback): void {
  // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only by design
  useEffect(effect, []);
}
