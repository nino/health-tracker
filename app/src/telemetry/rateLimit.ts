// A sliding-window cap on events sent, so an error loop can't flood PostHog
// (or the free tier). Over the cap, events are dropped, not delayed.

export type RateLimiter = { tryAcquire(nowMs: number): boolean };

export const MAX_EVENTS_PER_HOUR = 30;
const HOUR_MS = 60 * 60 * 1000;

export function createRateLimiter(
  max = MAX_EVENTS_PER_HOUR,
  windowMs = HOUR_MS,
): RateLimiter {
  const sent: number[] = [];
  return {
    tryAcquire(nowMs) {
      while (sent.length > 0 && sent[0] <= nowMs - windowMs) sent.shift();
      if (sent.length >= max) return false;
      sent.push(nowMs);
      return true;
    },
  };
}
