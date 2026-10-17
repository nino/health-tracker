import { describe, expect, test } from "bun:test";

import {
  MAX_FRAMES,
  MAX_MESSAGE_LENGTH,
  parseStack,
  sanitizeErrorType,
  sanitizeMessage,
} from "./sanitize";

describe("sanitizeMessage", () => {
  test("keeps the shape of ordinary engine errors", () => {
    expect(sanitizeMessage("Cannot read property 'length' of undefined")).toBe(
      "Cannot read property 'length' of undefined",
    );
    expect(
      sanitizeMessage(
        "Calling the 'saveCategorySample' function has failed\n→ Caused by: The operation couldn’t be completed.",
      ),
    ).toBe(
      "Calling the 'saveCategorySample' function has failed → Caused by: The operation couldn’t be completed.",
    );
    expect(sanitizeMessage("no such table: settings")).toBe(
      "no such table: settings",
    );
  });

  test("scrubs quoted text, numbers, dates and ids", () => {
    expect(
      sanitizeMessage(
        `Unexpected token 'h', "headache after lunch" is not valid JSON`,
      ),
    ).toBe(`Unexpected token 'h', "…" is not valid JSON`);
    expect(
      sanitizeMessage(
        "valence 0.75 out of range at 2026-07-16T09:00:00+02:00, 1752656400000 at 9:30, 7 → 5",
      ),
    ).toBe("valence # out of range at <date>, # at #, # → #");
    expect(
      sanitizeMessage(
        "unknown kind: custom:0b6c0d3e-8f0a-4c5e-9a43-3c1f0e1d2a7b",
      ),
    ).toBe("unknown kind: custom:<id>");
    expect(sanitizeMessage("comment was 'felt dizzy all day'")).toBe(
      "comment was '…'",
    );
    expect(sanitizeMessage("value `7`")).toBe("value `…`");
  });

  test("keeps versions and hex glued to letters", () => {
    expect(sanitizeMessage("Database schema v9 is newer than v7")).toBe(
      "Database schema v9 is newer than v7",
    );
  });

  test("scrubs specific symptom types, paths, URIs and emails", () => {
    expect(
      sanitizeMessage("Not authorized for HKCategoryTypeIdentifierNausea"),
    ).toBe("Not authorized for <hk-type>");
    expect(
      sanitizeMessage(
        "Could not read file:///var/mobile/Documents/my%20diary.json or /data/user/0/x.json (me@example.com)",
      ),
    ).toBe("Could not read <uri> or <path> (<email>)");
  });

  test("caps the length", () => {
    const long = sanitizeMessage("x".repeat(1000));
    expect(long.length).toBe(MAX_MESSAGE_LENGTH);
    expect(long.endsWith("…")).toBe(true);
  });
});

describe("sanitizeErrorType", () => {
  test("passes class names, replaces anything else", () => {
    expect(sanitizeErrorType("TypeError")).toBe("TypeError");
    expect(sanitizeErrorType("Error: with message")).toBe("Error");
    expect(sanitizeErrorType(undefined)).toBe("Error");
    expect(sanitizeErrorType("A".repeat(65))).toBe("Error");
  });
});

describe("parseStack", () => {
  test("Hermes and V8 frames, outermost first, message lines dropped", () => {
    const stack = [
      "Error: secret note text 'like this'",
      "    at saveEntry (address at /data/app/x/index.android.bundle:1:2345)",
      "    at onPress (http://localhost:8081/index.bundle?platform=ios:10:20)",
      "    at anonymous (native)",
      "    at /private/var/containers/Bundle/App.app/main.jsbundle:3:4",
    ].join("\n");
    expect(parseStack(stack)).toEqual([
      {
        platform: "web:javascript",
        function: "?",
        filename: "main.jsbundle",
        lineno: 3,
        colno: 4,
        in_app: true,
      },
      {
        platform: "web:javascript",
        function: "anonymous",
        filename: "native",
        lineno: undefined,
        colno: undefined,
        in_app: false,
      },
      {
        platform: "web:javascript",
        function: "onPress",
        filename: "index.bundle",
        lineno: 10,
        colno: 20,
        in_app: true,
      },
      {
        platform: "web:javascript",
        function: "saveEntry",
        filename: "index.android.bundle",
        lineno: 1,
        colno: 2345,
        in_app: true,
      },
    ]);
  });

  test("JSC frames", () => {
    expect(parseStack("render@http://x/main.js:5:6")).toEqual([
      {
        platform: "web:javascript",
        function: "render",
        filename: "main.js",
        lineno: 5,
        colno: 6,
        in_app: true,
      },
    ]);
  });

  test("caps the frame count and survives garbage", () => {
    const deep = Array.from(
      { length: 100 },
      (_, i) => `at f${i} (a.js:${i}:1)`,
    );
    expect(parseStack(deep.join("\n")).length).toBe(MAX_FRAMES);
    expect(parseStack("")).toEqual([]);
    expect(parseStack("just some words\nmore")).toEqual([]);
  });
});
