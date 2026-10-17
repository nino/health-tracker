import { describe, expect, test } from "bun:test";

import { createRateLimiter } from "./rateLimit";

describe("createRateLimiter", () => {
  test("allows max per window, drops the rest, frees up as the window slides", () => {
    const limiter = createRateLimiter(3, 1000);
    expect([0, 10, 20, 30].map((t) => limiter.tryAcquire(t))).toEqual([
      true,
      true,
      true,
      false,
    ]);
    // A dropped event doesn't take a slot.
    expect(limiter.tryAcquire(999)).toBe(false);
    expect(limiter.tryAcquire(1000)).toBe(true); // the t=0 slot expired
    expect(limiter.tryAcquire(1001)).toBe(false);
  });

  test("defaults to 30 an hour", () => {
    const limiter = createRateLimiter();
    const allowed = Array.from({ length: 40 }, (_, i) =>
      limiter.tryAcquire(i * 1000),
    ).filter(Boolean).length;
    expect(allowed).toBe(30);
    expect(limiter.tryAcquire(60 * 60 * 1000)).toBe(true);
  });
});
