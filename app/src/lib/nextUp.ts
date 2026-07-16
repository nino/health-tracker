// "Save & Next" advances through the main-grid order (metrics, then enabled
// symptoms) to the next item that still needs logging — anything not logged
// within the last 10 minutes. Scanning starts after the current item and
// wraps, so repeated Save & Next walks the whole grid once.

export const NEXT_UP_WINDOW_MS = 10 * 60_000;

export function nextUp<T extends { id: string }>(
  items: T[],
  currentId: string,
  lastLogged: Map<string, Date>,
  now: Date,
): T | undefined {
  const needsLogging = (item: T) => {
    const last = lastLogged.get(item.id);
    return !last || now.getTime() - last.getTime() >= NEXT_UP_WINDOW_MS;
  };
  // If the current item isn't in the list (e.g. just disabled), start at 0.
  const start = items.findIndex((item) => item.id === currentId);
  for (let offset = 1; offset <= items.length; offset++) {
    const item = items[(start + offset) % items.length];
    if (item.id !== currentId && needsLogging(item)) return item;
  }
  return undefined;
}
