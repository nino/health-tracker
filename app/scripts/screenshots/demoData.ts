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
    text?: string;
    date: string;
    loggedAt: string;
  }[] = [];
  const start = new Date(2026, 4, 18); // a Monday, ~10 weeks of data

  const add = (
    kind: string,
    rating: number,
    day: number,
    hour: number,
    text?: string,
  ) => {
    const d = new Date(2026, 4, 18, hour, Math.floor(rand() * 60));
    d.setDate(start.getDate() + day);
    entries.push({
      kind,
      rating,
      ...(text === undefined ? {} : { text }),
      date: iso(d),
      loggedAt: iso(d),
    });
  };
  const clamp = (min: number, max: number, v: number) =>
    Math.min(max, Math.max(min, Math.round(v)));

  for (let day = 0; day < 70; day++) {
    const wave = Math.sin((day / 7) * Math.PI * 0.55);
    add("mood", clamp(1, 10, 6 + 2 * wave + (rand() - 0.5) * 4), day, 9);
    if (rand() < 0.6) {
      add("mood", clamp(1, 10, 6 + 2 * wave + (rand() - 0.5) * 4), day, 20);
    }
    add("stress", clamp(1, 10, 4 - 2 * wave + (rand() - 0.5) * 5), day, 12);
    if (rand() < 0.5) {
      add("stress", clamp(1, 10, 4 - 2 * wave + (rand() - 0.5) * 5), day, 18);
    }
    add("anxiety", clamp(1, 10, 3 - wave + (rand() - 0.5) * 4), day, 15);
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
    // Custom items (issue #5): a rating item, a severity item, an event.
    if (rand() < 0.55) {
      add(`custom:${FLOSSED_ID}`, 1, day, 22);
    }
    add(
      `custom:${ENERGY_ID}`,
      clamp(1, 10, 6 + wave + (rand() - 0.5) * 4),
      day,
      10,
    );
    if (rand() < 0.4) {
      const severities = [1, 1, 2, 2, 3];
      add(
        `custom:${TINNITUS_ID}`,
        severities[Math.floor(rand() * severities.length)],
        day,
        16,
      );
    }
    // New kinds: a numeric item (decimals, slow drift) and a text item.
    if (rand() < 0.7) {
      add(
        `custom:${WEIGHT_ID}`,
        Math.round((72 + wave + (rand() - 0.5) * 1.5) * 10) / 10,
        day,
        7,
      );
    }
    if (rand() < 0.35) {
      const thoughts = [
        "Went fine, mind wandered a bit.",
        "Dreaded it all day, then it took five minutes.",
        "Actually relaxing today.",
        "Annoyed — the pan was still greasy.",
        "Listened to a podcast, barely noticed doing them.",
      ];
      add(
        `custom:${DISHES_ID}`,
        0,
        day,
        19,
        thoughts[Math.floor(rand() * thoughts.length)],
      );
    }
  }

  const customItems = [
    {
      id: ENERGY_ID,
      name: "Energy",
      icon: "⚡",
      kind: "rating",
      highIsGood: true,
      createdAt: iso(new Date(2026, 4, 18, 8)),
      archivedAt: null,
    },
    {
      id: TINNITUS_ID,
      name: "Tinnitus",
      icon: "🔔",
      kind: "severity",
      highIsGood: false,
      createdAt: iso(new Date(2026, 4, 18, 8)),
      archivedAt: null,
    },
    {
      id: FLOSSED_ID,
      name: "Flossed",
      icon: "🦷",
      kind: "event",
      highIsGood: false,
      createdAt: iso(new Date(2026, 4, 18, 8)),
      archivedAt: null,
    },
    {
      id: WEIGHT_ID,
      name: "Weight",
      icon: "⚖️",
      kind: "numeric",
      highIsGood: false,
      createdAt: iso(new Date(2026, 4, 18, 8)),
      archivedAt: null,
    },
    {
      id: DISHES_ID,
      name: "Dishes",
      icon: "🍽️",
      kind: "text",
      highIsGood: false,
      createdAt: iso(new Date(2026, 4, 18, 8)),
      archivedAt: null,
    },
  ];

  return JSON.stringify({
    exportedAt: iso(new Date(2026, 6, 28, 8)),
    entries,
    customItems,
  });
}

const ENERGY_ID = "0e2e6f0a-6a1c-4c1e-9f4e-000000000001";
const TINNITUS_ID = "0e2e6f0a-6a1c-4c1e-9f4e-000000000002";
const FLOSSED_ID = "0e2e6f0a-6a1c-4c1e-9f4e-000000000003";
const WEIGHT_ID = "0e2e6f0a-6a1c-4c1e-9f4e-000000000004";
const DISHES_ID = "0e2e6f0a-6a1c-4c1e-9f4e-000000000005";
