// Random pick that slightly favors symptoms logged least recently, so
// occasional "Random" logging spreads coverage across all symptoms — a port
// of Symptom.weightedRandomByRecency. Never-logged symptoms count as oldest.
// Weights run linearly from 1x (most recent) to 3x (least recent) regardless
// of how many symptoms are enabled — a nudge, not a guarantee.

export function weightedRandomByRecency<T extends { id: string }>(
  items: T[],
  lastLogged: Map<string, Date>,
  random: () => number = Math.random,
): T | undefined {
  if (items.length <= 1) return items[0];
  const oldestFirst = [...items].sort(
    (a, b) =>
      (lastLogged.get(a.id)?.getTime() ?? -Infinity) -
      (lastLogged.get(b.id)?.getTime() ?? -Infinity),
  );
  const step = 2 / (oldestFirst.length - 1);
  const weights = oldestFirst.map(
    (_, index) => 1 + step * (oldestFirst.length - 1 - index),
  );
  let remaining = random() * weights.reduce((sum, w) => sum + w, 0);
  for (let i = 0; i < oldestFirst.length; i++) {
    remaining -= weights[i];
    if (remaining < 0) return oldestFirst[i];
  }
  return oldestFirst[oldestFirst.length - 1];
}
