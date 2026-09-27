/**
 * Back navigation, without a router.
 *
 * Two layers decide what Android Back (or Escape) does:
 *   1. Overlays: open sheets and inline editors register a handler while they
 *      are visible. The most recently opened one closes first.
 *   2. Screens: App keeps a small history of in-app navigations and restores
 *      the previous screen (tab, filters, sort, scroll position).
 * Only when both are empty on the root Home screen does the app minimise.
 */
import { useEffect, useRef } from 'react';

interface Handler {
  run: () => void;
}

const overlays: Handler[] = [];

/** While `active`, Back calls `onBack` (closing this overlay) instead of navigating. */
export function useBackHandler(active: boolean, onBack: () => void) {
  const latest = useRef(onBack);
  useEffect(() => {
    latest.current = onBack;
  });
  useEffect(() => {
    if (!active) return;
    const h: Handler = { run: () => latest.current() };
    overlays.push(h);
    return () => {
      const i = overlays.indexOf(h);
      if (i >= 0) overlays.splice(i, 1);
    };
  }, [active]);
}

/** Closes the top-most overlay. Returns false when nothing was open. */
export function closeTopOverlay(): boolean {
  const h = overlays[overlays.length - 1];
  if (!h) return false;
  h.run();
  return true;
}
