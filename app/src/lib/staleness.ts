// Staleness buckets and relative-age text for the main-grid tiles — a port of
// stalenessColor/lastLoggedText in the Swift ContentView.

export type Staleness = "fresh" | "green" | "yellow" | "orange" | "red";

export function staleness(lastDate: Date | null, now: Date): Staleness {
  if (lastDate === null) return "red";
  const hours = (now.getTime() - lastDate.getTime()) / 3_600_000;
  if (hours < 2) return "fresh";
  if (hours < 4) return "green";
  if (hours < 8) return "yellow";
  if (hours < 24) return "orange";
  return "red";
}

export function relativeAge(lastDate: Date | null, now: Date): string {
  if (lastDate === null) return "never";
  const minutes = Math.max(
    0,
    Math.floor((now.getTime() - lastDate.getTime()) / 60_000),
  );
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}
