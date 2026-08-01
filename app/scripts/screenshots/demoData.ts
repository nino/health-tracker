// Deterministic demo data (seeded PRNG) in the app's import-JSON format:
// ~10 weeks of mood/stress/anxiety plus headache/nausea entries, with a
// gentle weekly wave so day/week averages look visibly different from raw.

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

// Local-time ISO with the runner's UTC offset baked in as +00:00 — the
// containers this runs in are UTC, and the import regex requires an offset.
function iso(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}:${pad(d.getSeconds())}+00:00`;
}

export function generateDemoExport(): string {
  const rand = mulberry32(42);
  const entries: {
    kind: string;
    rating: number;
    date: string;
    loggedAt: string;
  }[] = [];
  const start = new Date(2026, 4, 18); // a Monday, ~10 weeks of data

  const add = (kind: string, rating: number, day: number, hour: number) => {
    const d = new Date(2026, 4, 18, hour, Math.floor(rand() * 60));
    d.setDate(start.getDate() + day);
    entries.push({ kind, rating, date: iso(d), loggedAt: iso(d) });
  };
  const clamp = (min: number, max: number, v: number) =>
    Math.min(max, Math.max(min, Math.round(v)));

  for (let day = 0; day < 70; day++) {
    const wave = Math.sin((day / 7) * Math.PI * 0.55);
    add("mood", clamp(1, 10, 6 + 2 * wave + (rand() - 0.5) * 4), day, 9);
    if (rand() < 0.6) {
      add("mood", clamp(1, 10, 6 + 2 * wave + (rand() - 0.5) * 4), day, 20);
    }
    add("stress", clamp(0, 10, 4 - 2 * wave + (rand() - 0.5) * 5), day, 12);
    if (rand() < 0.5) {
      add("stress", clamp(0, 10, 4 - 2 * wave + (rand() - 0.5) * 5), day, 18);
    }
    add("anxiety", clamp(0, 10, 3 - wave + (rand() - 0.5) * 4), day, 15);
    // Severity raw values: 1 notPresent, 2 mild, 3 moderate, 4 severe.
    if (rand() < 0.8) {
      const severities = [1, 1, 2, 2, 2, 3, 3, 4];
      add(
        "HKCategoryTypeIdentifierHeadache",
        severities[Math.floor(rand() * severities.length)],
        day,
        14,
      );
    }
    if (rand() < 0.5) {
      const severities = [1, 1, 1, 2, 2, 3];
      add(
        "HKCategoryTypeIdentifierNausea",
        severities[Math.floor(rand() * severities.length)],
        day,
        11,
      );
    }
  }

  return JSON.stringify({ exportedAt: iso(new Date(2026, 6, 28, 8)), entries });
}
