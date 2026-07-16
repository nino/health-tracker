import { describe, expect, test } from "bun:test";

import { EntryStore } from "../store/entryStore";
import { migrate } from "../store/migrations";
import { memoryDriver, sequentialIds } from "../store/testDriver";
import {
  ensureAuthorization,
  importBackendHistory,
  mirrorPending,
} from "./sync";
import { type BackendSample, type HealthBackend } from "./types";

function fakeBackend(
  overrides: Partial<HealthBackend> = {},
): HealthBackend & { written: { kind: string; value: number; date: Date }[] } {
  const written: { kind: string; value: number; date: Date }[] = [];
  return {
    written,
    name: "fake",
    capability: (kind) =>
      kind === "mood" || kind === "HKCategoryTypeIdentifierHeadache"
        ? "read-write"
        : "none",
    requestAuthorization: () => Promise.resolve(),
    write: (kind, value, date) => {
      written.push({ kind, value, date });
      return Promise.resolve(`fake-${written.length}`);
    },
    history: () => Promise.resolve([]),
    ...overrides,
  };
}

function fresh() {
  const db = memoryDriver();
  migrate(db);
  return { db, store: new EntryStore(db, sequentialIds()) };
}

describe("mirrorPending", () => {
  test("mirrors supported kinds, skips unsupported, records provenance", async () => {
    const { store } = fresh();
    const backend = fakeBackend();
    store.add("mood", 7, new Date("2026-07-16T08:00:00Z"));
    store.add("stress", 4, new Date("2026-07-16T08:01:00Z")); // no capability
    store.add(
      "HKCategoryTypeIdentifierHeadache",
      2,
      new Date("2026-07-16T08:02:00Z"),
    );

    expect(await mirrorPending(store, backend)).toBe(2);
    expect(backend.written.map((w) => w.kind).sort()).toEqual([
      "HKCategoryTypeIdentifierHeadache",
      "mood",
    ]);
    expect(store.byKind("mood")[0].backend).toBe("fake");
    expect(store.byKind("stress")[0].backend).toBeNull();
    // Nothing left to mirror on a second run.
    expect(await mirrorPending(store, backend)).toBe(0);
  });

  test("failed writes stay queued and retry next run", async () => {
    const { store } = fresh();
    let failing = true;
    const backend = fakeBackend({
      write: () => {
        if (failing) return Promise.reject(new Error("healthd unavailable"));
        return Promise.resolve("ok-1");
      },
    });
    store.add("mood", 6, new Date("2026-07-16T09:00:00Z"));

    expect(await mirrorPending(store, backend)).toBe(0);
    expect(store.byKind("mood")[0].backend).toBeNull();

    failing = false;
    expect(await mirrorPending(store, backend)).toBe(1);
    expect(store.byKind("mood")[0].backendId).toBe("ok-1");
  });

  test("permanently failing entries park after bounded attempts", async () => {
    const { store } = fresh();
    let writes = 0;
    const backend = fakeBackend({
      write: () => {
        writes++;
        return Promise.reject(new Error("authorization denied"));
      },
    });
    store.add("mood", 6, new Date("2026-07-16T09:00:00Z"));

    for (let run = 0; run < 20; run++) {
      await mirrorPending(store, backend);
    }
    // MAX_MIRROR_ATTEMPTS, not 20: the entry parks instead of retrying forever.
    expect(writes).toBe(5);
    // Still fully present locally.
    expect(store.byKind("mood").length).toBe(1);
  });

  test("concurrent runs never double-write an entry (single-flight)", async () => {
    const { store } = fresh();
    const written: string[] = [];
    const backend = fakeBackend({
      write: (kind) =>
        new Promise((resolve) => {
          setTimeout(() => {
            written.push(kind);
            resolve(`id-${written.length}`);
          }, 10);
        }),
    });
    // A queued backlog...
    store.add("mood", 5, new Date("2026-07-16T08:00:00Z"));
    store.add("mood", 6, new Date("2026-07-16T08:10:00Z"));
    // ...being drained while a save fires a second run mid-flight.
    const first = mirrorPending(store, backend);
    store.add("HKCategoryTypeIdentifierHeadache", 2, new Date());
    const second = mirrorPending(store, backend);
    const [a, b] = await Promise.all([first, second]);

    expect(written.length).toBe(3); // each entry exactly once
    expect(a + b).toBe(3);
  });

  test("a crash between write and markSynced leaves a claim, not a retry", async () => {
    const { store } = fresh();
    const backend = fakeBackend();
    const entry = store.add("mood", 5, new Date("2026-07-16T08:00:00Z"));
    // Simulate the crash: the claim was taken, the process died before
    // markSynced. On the next launch the entry must not be written again.
    store.claimForMirror(entry.id, backend.name);
    expect(await mirrorPending(store, backend)).toBe(0);
    expect(backend.written.length).toBe(0);
  });
});

describe("ensureAuthorization", () => {
  test("requests once, then never again for the same kind-set", async () => {
    const { db } = fresh();
    let requests = 0;
    const backend = fakeBackend({
      requestAuthorization: () => {
        requests++;
        return Promise.resolve();
      },
    });
    await ensureAuthorization(db, backend);
    await ensureAuthorization(db, backend);
    expect(requests).toBe(1);
  });

  test("skips entirely when the backend supports nothing", async () => {
    const { db } = fresh();
    let requests = 0;
    const backend = fakeBackend({
      capability: () => "none",
      requestAuthorization: () => {
        requests++;
        return Promise.resolve();
      },
    });
    await ensureAuthorization(db, backend);
    expect(requests).toBe(0);
  });

  test("swapping one kind for another re-requests (key is set-based, not count)", async () => {
    const { db } = fresh();
    let requests = 0;
    const requestAuthorization = () => {
      requests++;
      return Promise.resolve();
    };
    await ensureAuthorization(db, fakeBackend({ requestAuthorization }));
    // Same *count* of kinds, different set:
    await ensureAuthorization(
      db,
      fakeBackend({
        requestAuthorization,
        capability: (kind) =>
          kind === "stress" || kind === "HKCategoryTypeIdentifierHeadache"
            ? "read-write"
            : "none",
      }),
    );
    expect(requests).toBe(2);
  });

  test("a failed request is retried next launch (flag not set)", async () => {
    const { db } = fresh();
    let failing = true;
    let requests = 0;
    const backend = fakeBackend({
      requestAuthorization: () => {
        requests++;
        return failing
          ? Promise.reject(new Error("prompt dismissed by termination"))
          : Promise.resolve();
      },
    });
    await ensureAuthorization(db, backend).catch(() => {});
    failing = false;
    await ensureAuthorization(db, backend);
    await ensureAuthorization(db, backend);
    expect(requests).toBe(2);
  });
});

describe("importBackendHistory", () => {
  const history: BackendSample[] = [
    { backendId: "hk-1", value: 7, date: new Date("2026-06-01T10:00:00Z") },
    { backendId: "hk-2", value: 3, date: new Date("2026-06-02T10:00:00Z") },
  ];

  test("imports once with provenance, then never again", async () => {
    const { db, store } = fresh();
    const backend = fakeBackend({
      history: (kind) => Promise.resolve(kind === "mood" ? history : []),
    });

    expect(await importBackendHistory(db, store, backend)).toBe(2);
    const flags = db.all<{ key: string }>(
      `SELECT key FROM settings WHERE key LIKE 'didImportFromBackend:fake%'`,
    );
    expect(flags.length).toBe(1);
    const moods = store.byKind("mood");
    expect(moods.length).toBe(2);
    expect(moods[0].backend).toBe("fake");
    expect(moods[0].backendId).toBe("hk-1");

    // Second call is a no-op even if the backend now has more history.
    expect(await importBackendHistory(db, store, backend)).toBe(0);
  });

  test("imported entries are not mirrored back to the backend", async () => {
    const { db, store } = fresh();
    const backend = fakeBackend({
      history: (kind) => Promise.resolve(kind === "mood" ? history : []),
    });
    await importBackendHistory(db, store, backend);
    expect(await mirrorPending(store, backend)).toBe(0);
    expect(backend.written.length).toBe(0);
  });

  test("no flag is set while the backend supports nothing, so a later capability light-up still backfills", async () => {
    const { db, store } = fresh();
    const nothing = fakeBackend({
      capability: () => "none",
      history: () => Promise.resolve(history),
    });
    expect(await importBackendHistory(db, store, nothing)).toBe(0);

    // Health Connect ships symptom support; same backend name, real kinds now.
    const backend = fakeBackend({
      name: "fake",
      history: (kind) => Promise.resolve(kind === "mood" ? history : []),
    });
    expect(await importBackendHistory(db, store, backend)).toBe(2);
  });

  test("dual-written entries dedup against the local copy", async () => {
    const { db, store } = fresh();
    // Logged in this app moments before the import runs:
    store.add("mood", 7, new Date("2026-06-01T10:00:01Z"));
    const backend = fakeBackend({
      history: (kind) => Promise.resolve(kind === "mood" ? history : []),
    });
    // hk-1 is within 2s of the local entry -> skipped; hk-2 imports.
    expect(await importBackendHistory(db, store, backend)).toBe(1);
    expect(store.byKind("mood").length).toBe(2);
  });
});
