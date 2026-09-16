import { describe, expect, test } from "bun:test";

import { exportSchema } from "./exportSchema";
import { METRICS } from "./metrics";
import { NOTE_KIND } from "./note";
import { SYMPTOMS } from "./symptoms";

interface Branch {
  if: { properties: { kind: { enum: string[] } } };
  then: { properties: { rating: Record<string, unknown> } };
}

function branches(customItems: Parameters<typeof exportSchema>[0] = []) {
  const schema = exportSchema(customItems) as {
    properties: { entries: { items: { allOf: Branch[] } } };
  };
  return schema.properties.entries.items.allOf;
}

function branchFor(kind: string, all: Branch[]): Branch[] {
  return all.filter((b) => b.if.properties.kind.enum.includes(kind));
}

describe("exportSchema", () => {
  test("every built-in kind has exactly one rating rule", () => {
    const all = branches();
    const kinds = [
      ...SYMPTOMS.map((s) => s.id),
      ...METRICS.map((m) => m.id),
      NOTE_KIND,
    ];
    for (const kind of kinds) {
      expect(branchFor(kind, all).length).toBe(1);
    }
  });

  test("severity values are labelled with 0 = Present, 1 = Not Present", () => {
    const [rule] = branchFor("HKCategoryTypeIdentifierHeadache", branches());
    const labels = rule.then.properties.rating.oneOf as {
      const: number;
      title: string;
    }[];
    expect(labels).toContainEqual({ const: 0, title: "Present" });
    expect(labels).toContainEqual({ const: 1, title: "Not Present" });
    expect(labels).toContainEqual({ const: 4, title: "Severe" });
  });

  test("metric scales spell out their bands", () => {
    const [rule] = branchFor("mood", branches());
    expect(rule.then.properties.rating.description).toContain(
      "1–2 Very Negative",
    );
    expect(rule.then.properties.rating.description).toContain(
      "9–10 Very Positive",
    );
    const [stress] = branchFor("stress", branches());
    expect(stress.then.properties.rating.description).toContain("1 None");
  });

  test("custom items get rules by their kind", () => {
    const all = branches([
      { id: "a", name: "Weight", kind: "numeric", highIsGood: false },
      { id: "b", name: "Energy", kind: "rating", highIsGood: true },
      { id: "c", name: "Nap", kind: "event", highIsGood: false },
    ]);
    expect(branchFor("custom:a", all)[0].then.properties.rating.type).toBe(
      "number",
    );
    expect(
      branchFor("custom:b", all)[0].then.properties.rating.description,
    ).toContain("Higher is better");
    expect(branchFor("custom:c", all)[0].then.properties.rating.const).toBe(1);
  });

  test("omits rules for custom kinds with no items", () => {
    const empty = branches().filter(
      (b) => b.if.properties.kind.enum.length === 0,
    );
    expect(empty).toEqual([]);
  });
});
