// Timestamps are serialized as ISO 8601 with the local UTC offset and second
// precision ("2026-07-12T09:41:00+02:00") — the same convention as the Swift
// app's MetricStore, so exports stay timezone-aware and both stores stay
// mutually importable.

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function toLocalISOString(date: Date): string {
  const year = date.getFullYear();
  // Years outside 1..9999 can't be represented in plain ISO 8601 and would
  // serialize to strings parseISOString rejects — refuse loudly instead of
  // poisoning the store (import validation rejects them much earlier).
  if (year < 1 || year > 9999) {
    throw new RangeError(`Date year out of ISO 8601 range: ${year}`);
  }
  const y = String(year).padStart(4, "0");
  const mo = pad(date.getMonth() + 1);
  const d = pad(date.getDate());
  const h = pad(date.getHours());
  const mi = pad(date.getMinutes());
  const s = pad(date.getSeconds());
  // getTimezoneOffset is minutes *behind* UTC, so the sign flips.
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const oh = pad(Math.floor(Math.abs(offsetMinutes) / 60));
  const om = pad(Math.abs(offsetMinutes) % 60);
  return `${y}-${mo}-${d}T${h}:${mi}:${s}${sign}${oh}:${om}`;
}

export function parseISOString(value: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid ISO 8601 date: ${value}`);
  }
  return date;
}
