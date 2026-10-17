import { describe, expect, test } from "bun:test";

import {
  createTelemetry,
  exceptionList,
  telemetryConfig,
  type PendingStore,
  type TelemetryDeps,
} from "./client";
import { createRateLimiter } from "./rateLimit";

const CONFIG = { apiKey: "phc_test", host: "https://eu.i.posthog.com" };

type Sent = { url: string; body: Record<string, unknown> };

function setup(overrides: Partial<TelemetryDeps> = {}) {
  const sent: Sent[] = [];
  let id: string | null = "anon-1";
  let ids = 0;
  const deps: TelemetryDeps = {
    config: CONFIG,
    distinctId: () => id,
    common: { $app_version: "1.2.3", $os: "iOS", $os_version: "26.0" },
    send: (url, body) => {
      sent.push({ url, body: JSON.parse(body) });
      return Promise.resolve();
    },
    limiter: createRateLimiter(),
    now: () => new Date("2026-10-17T10:00:00Z"),
    newId: () => `uuid-${++ids}`,
    ...overrides,
  };
  return {
    sent,
    telemetry: createTelemetry(deps),
    optOut: () => {
      id = null;
    },
  };
}

function memoryPending(): PendingStore & { body: string | null } {
  return {
    body: null,
    save(body) {
      this.body = body;
    },
    take() {
      const body = this.body;
      this.body = null;
      return body;
    },
  };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("telemetryConfig", () => {
  test("needs both values and an https host", () => {
    expect(telemetryConfig("phc_x", "https://eu.i.posthog.com/")).toEqual({
      apiKey: "phc_x",
      host: "https://eu.i.posthog.com",
    });
    expect(telemetryConfig(undefined, "https://eu.i.posthog.com")).toBeNull();
    expect(telemetryConfig("phc_x", "")).toBeNull();
    expect(telemetryConfig(" ", "https://x")).toBeNull();
    expect(telemetryConfig("phc_x", "http://insecure")).toBeNull();
  });
});

describe("createTelemetry", () => {
  test("an error becomes an anonymous $exception event", () => {
    const { sent, telemetry } = setup();
    const error = new TypeError("bad value 7");
    error.stack = "TypeError: bad value 7\n    at save (main.jsbundle:1:2)";
    telemetry.captureError(error, "mirror", {
      extra: { backend: "healthkit", entry_category: "symptom" },
    });

    expect(sent).toEqual([
      {
        url: "https://eu.i.posthog.com/i/v0/e/",
        body: {
          api_key: "phc_test",
          uuid: "uuid-1",
          event: "$exception",
          distinct_id: "anon-1",
          timestamp: "2026-10-17T10:00:00.000Z",
          properties: {
            $app_version: "1.2.3",
            $os: "iOS",
            $os_version: "26.0",
            $exception_list: [
              {
                type: "TypeError",
                value: "bad value #",
                mechanism: { handled: true, synthetic: false, type: "generic" },
                stacktrace: {
                  type: "raw",
                  frames: [
                    {
                      platform: "web:javascript",
                      function: "save",
                      filename: "main.jsbundle",
                      lineno: 1,
                      colno: 2,
                      in_app: true,
                    },
                  ],
                },
              },
            ],
            $exception_level: "error",
            context: "mirror",
            backend: "healthkit",
            entry_category: "symptom",
            $lib: "health-tracker",
            $process_person_profile: false,
            $geoip_disable: true,
          },
        },
      },
    ]);
  });

  test("usage events carry only their declared properties", () => {
    const { sent, telemetry } = setup();
    telemetry.capture({ name: "app_opened" });
    telemetry.capture({ name: "entry_logged", category: "metric" });
    expect(sent.map((s) => s.body.event)).toEqual([
      "app_opened",
      "entry_logged",
    ]);
    expect(sent[1].body.properties).toEqual({
      $app_version: "1.2.3",
      $os: "iOS",
      $os_version: "26.0",
      category: "metric",
      $lib: "health-tracker",
      $process_person_profile: false,
      $geoip_disable: true,
    });
  });

  test("sends nothing while opted out, and queues nothing for later", async () => {
    const pending = memoryPending();
    const { sent, telemetry, optOut } = setup({ pending });
    optOut();
    telemetry.capture({ name: "app_opened" });
    telemetry.captureError(new Error("x"), "uncaught", { fatal: true });
    telemetry.flushPending();
    await flush();
    expect(sent).toEqual([]);
    expect(pending.body).toBeNull();
  });

  test("an unreadable opt-in counts as opted out", () => {
    const { sent, telemetry } = setup({
      distinctId: () => {
        throw new Error("no such table: settings");
      },
    });
    telemetry.captureError(new Error("x"), "query");
    expect(sent).toEqual([]);
  });

  test("sends nothing without build-time config", () => {
    const { sent, telemetry } = setup({ config: null });
    telemetry.capture({ name: "app_opened" });
    telemetry.captureError(new Error("x"), "query");
    expect(sent).toEqual([]);
  });

  test("drops events over the rate limit", () => {
    const { sent, telemetry } = setup({ limiter: createRateLimiter(2) });
    for (let i = 0; i < 5; i++) telemetry.capture({ name: "app_opened" });
    expect(sent.length).toBe(2);
  });

  test("never throws, whatever send does", async () => {
    const { telemetry } = setup({
      send: () => Promise.reject(new Error("offline")),
    });
    telemetry.captureError(new Error("x"), "query");
    const throwing = setup({
      send: () => {
        throw new Error("sync throw");
      },
    });
    expect(() =>
      throwing.telemetry.capture({ name: "app_opened" }),
    ).not.toThrow();
    await flush();
  });

  test("a fatal error is kept until sent, and sent next launch if it wasn't", async () => {
    const pending = memoryPending();
    const offline = setup({
      pending,
      send: () => new Promise(() => {}), // the app dies mid-request
    });
    offline.telemetry.captureError(new Error("boom"), "uncaught", {
      fatal: true,
      handled: false,
    });
    const kept = JSON.parse(pending.body ?? "null");
    expect(kept.properties.$exception_level).toBe("fatal");
    expect(kept.properties.$exception_list[0].mechanism.handled).toBe(false);

    const nextLaunch = setup({ pending });
    nextLaunch.telemetry.flushPending();
    expect(nextLaunch.sent.map((s) => s.body)).toEqual([kept]);
    expect(pending.body).toBeNull();
  });

  test("a fatal report that got through is not sent again", async () => {
    const pending = memoryPending();
    const { telemetry } = setup({ pending });
    telemetry.captureError(new Error("boom"), "uncaught", { fatal: true });
    await flush();
    expect(pending.body).toBeNull();
  });
});

describe("exceptionList", () => {
  test("follows causes and never stringifies non-Errors", () => {
    const error = new Error("outer", {
      cause: new RangeError("inner", { cause: "my secret note" }),
    });
    const list = exceptionList(error, false);
    expect(list.map((e) => [e.type, e.value])).toEqual([
      ["Error", "outer"],
      ["RangeError", "inner"],
      ["NonError", "Non-Error value thrown (string)"],
    ]);
    expect(list[0].mechanism.handled).toBe(false);
  });

  test("redacts the message on request", () => {
    expect(
      exceptionList(
        new Error("Entry 3 has an invalid comment: hi"),
        true,
        true,
      )[0].value,
    ).toBe("[redacted]");
  });
});
