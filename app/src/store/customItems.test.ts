import { describe, expect, test } from "bun:test";

import {
  addCustomItem,
  archiveCustomItem,
  customEntryKind,
  listCustomItems,
  updateCustomItem,
} from "./customItems";
import { type SqlDriver } from "./driver";
import { migrate } from "./migrations";
import { memoryDriver, sequentialIds } from "./testDriver";

function freshDb(): SqlDriver {
  const db = memoryDriver();
  migrate(db);
  return db;
}

describe("customItems", () => {
  test("add, list (alphabetical), and round-trip fields", () => {
    const db = freshDb();
    const newId = sequentialIds();
    addCustomItem(db, newId, {
      name: "Tinnitus",
      icon: "🔔",
      kind: "severity",
      highIsGood: false,
    });
    addCustomItem(db, newId, {
      name: "Energy",
      icon: "⚡",
      kind: "rating",
      highIsGood: true,
    });

    const items = listCustomItems(db);
    expect(items.map((i) => i.name)).toEqual(["Energy", "Tinnitus"]);
    expect(items[0].kind).toBe("rating");
    expect(items[0].highIsGood).toBe(true);
    expect(items[1].highIsGood).toBe(false);
    expect(items[1].archivedAt).toBeNull();
  });

  test("highIsGood is forced false for severity items, add and update alike", () => {
    const db = freshDb();
    const item = addCustomItem(db, sequentialIds(), {
      name: "Tinnitus",
      icon: "🔔",
      kind: "severity",
      highIsGood: true, // ignored
    });
    expect(item.highIsGood).toBe(false);
    updateCustomItem(db, item.id, {
      name: "Tinnitus",
      icon: "🔔",
      highIsGood: true, // ignored again
    });
    expect(listCustomItems(db)[0].highIsGood).toBe(false);
  });

  test("update edits name/icon/direction but never the kind", () => {
    const db = freshDb();
    const item = addCustomItem(db, sequentialIds(), {
      name: "Energy",
      icon: "⚡",
      kind: "rating",
      highIsGood: false,
    });
    updateCustomItem(db, item.id, {
      name: "Vigor",
      icon: "🔥",
      highIsGood: true,
    });
    const updated = listCustomItems(db)[0];
    expect(updated.name).toBe("Vigor");
    expect(updated.icon).toBe("🔥");
    expect(updated.highIsGood).toBe(true);
    expect(updated.kind).toBe("rating");
  });

  test("archive hides an item from the default list but keeps it stored", () => {
    const db = freshDb();
    const item = addCustomItem(db, sequentialIds(), {
      name: "Tinnitus",
      icon: "🔔",
      kind: "severity",
      highIsGood: false,
    });
    archiveCustomItem(db, item.id);
    expect(listCustomItems(db)).toEqual([]);
    const all = listCustomItems(db, { includeArchived: true });
    expect(all.length).toBe(1);
    expect(all[0].archivedAt).not.toBeNull();
  });

  test("numeric and text kinds round-trip; highIsGood stays rating-only", () => {
    const db = freshDb();
    const newId = sequentialIds();
    const numeric = addCustomItem(db, newId, {
      name: "Press-ups",
      icon: "💪",
      kind: "numeric",
      highIsGood: true, // ignored — rating-only
    });
    const text = addCustomItem(db, newId, {
      name: "Dishes",
      icon: "🍽️",
      kind: "text",
      highIsGood: false,
    });
    expect(numeric.highIsGood).toBe(false);
    const items = listCustomItems(db);
    expect(items.map((i) => i.kind)).toEqual(["text", "numeric"]);
    expect(items.every((i) => !i.highIsGood)).toBe(true);
    updateCustomItem(db, text.id, {
      name: "Dishes",
      icon: "🍽️",
      highIsGood: true, // ignored again
    });
    expect(listCustomItems(db)[0].highIsGood).toBe(false);
  });

  test("customEntryKind prefixes and cannot collide with builtin ids", () => {
    expect(customEntryKind("abc")).toBe("custom:abc");
  });
});
