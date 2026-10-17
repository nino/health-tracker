import { describe, expect, test } from "bun:test";

import { METRICS, SYMPTOMS } from "../catalog";
import { NOTE_KIND } from "../catalog/note";
import { entryCategory } from "./events";

describe("entryCategory", () => {
  test("names only the broad category of a kind", () => {
    expect(entryCategory(SYMPTOMS[0].id)).toBe("symptom");
    expect(entryCategory(METRICS[0].id)).toBe("metric");
    expect(entryCategory("custom:abc")).toBe("custom");
    expect(entryCategory(NOTE_KIND)).toBe("note");
    expect(entryCategory("something-else")).toBe("other");
  });
});
