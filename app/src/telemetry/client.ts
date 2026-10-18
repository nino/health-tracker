import { type ErrorContext, type ErrorExtra, type UsageEvent } from "./events";
import { type RateLimiter } from "./rateLimit";
import { parseStack, sanitizeErrorType, sanitizeMessage } from "./sanitize";

// A hand-rolled PostHog client (the dependency policy rules out the SDK):
// one JSON POST per event to the capture endpoint. It is strictly opt-in —
// `distinctId()` returns null unless the user switched error reports on in
// Settings, and then nothing is built, queued or sent. It never throws into
// the app and never blocks: sending is fire-and-forget.

export type TelemetryConfig = { apiKey: string; host: string };

/** Build-time config; null (telemetry off for good) unless both are set. */
export function telemetryConfig(
  apiKey: string | undefined,
  host: string | undefined,
): TelemetryConfig | null {
  const key = apiKey?.trim();
  const base = host?.trim().replace(/\/+$/, "");
  if (!key || !base || !/^https:\/\//.test(base)) return null;
  return { apiKey: key, host: base };
}

/** Where a crash report waits for the next launch: a fatal error kills the
 * app before its fetch can finish. Holds at most one report. */
export type PendingStore = {
  save(body: string): void;
  /** The kept report, left in place until it has been sent. */
  peek(): string | null;
  /** Delete the kept report only if it is still this one. */
  discard(body: string): void;
};

export type TelemetryDeps = {
  config: TelemetryConfig | null;
  /** The anonymous id while opted in; null while opted out. */
  distinctId: () => string | null;
  /** App version, OS and OS version, sent with every event. */
  common: Record<string, string>;
  send: (url: string, body: string) => Promise<unknown>;
  limiter: RateLimiter;
  /** A second, per-context cap, so one noisy source (a backend that fails
   * every write) can't use up the budget other errors need. */
  contextLimiter?: () => RateLimiter;
  now: () => Date;
  newId: () => string;
  pending?: PendingStore;
};

export type ErrorOptions = {
  handled?: boolean;
  /** The app is about to die: keep the report for the next launch too. */
  fatal?: boolean;
  /** Send only the message's headline, the text before its first ": "
   * (errors that quote user content after it, like JSON parse errors and
   * the importer's). */
  headlineOnly?: boolean;
  extra?: ErrorExtra;
};

export type Telemetry = {
  captureError(
    error: unknown,
    context: ErrorContext,
    options?: ErrorOptions,
  ): void;
  capture(event: UsageEvent): void;
  /** Send (or, if opted out since, discard) a crash kept from last launch. */
  flushPending(): void;
};

type ExceptionEntry = {
  type: string;
  value: string;
  mechanism: { handled: boolean; synthetic: boolean; type: "generic" };
  stacktrace?: { type: "raw"; frames: ReturnType<typeof parseStack> };
};

const MAX_CAUSES = 3;

function headline(message: string): string {
  const end = message.indexOf(": ");
  return end === -1 ? message : message.slice(0, end);
}

/** `$exception_list`, outermost error first, following `cause` a few deep. */
export function exceptionList(
  error: unknown,
  handled: boolean,
  headlineOnly = false,
): ExceptionEntry[] {
  const list: ExceptionEntry[] = [];
  let current: unknown = error;
  while (list.length <= MAX_CAUSES && current !== undefined) {
    if (!(current instanceof Error)) {
      // Thrown non-Errors can be anything, including user data: name the
      // kind of value only.
      list.push({
        type: "NonError",
        value: `Non-Error value thrown (${current === null ? "null" : typeof current})`,
        mechanism: { handled, synthetic: true, type: "generic" },
      });
      break;
    }
    const frames = parseStack(current.stack ?? "", current.message);
    list.push({
      type: sanitizeErrorType(current.name),
      value: sanitizeMessage(
        headlineOnly ? headline(current.message) : current.message,
      ),
      mechanism: { handled, synthetic: false, type: "generic" },
      ...(frames.length > 0 && { stacktrace: { type: "raw", frames } }),
    });
    current = current.cause;
  }
  return list;
}

export function createTelemetry(deps: TelemetryDeps): Telemetry {
  const { config } = deps;
  const url = config && `${config.host}/i/v0/e/`;
  const contextLimiters = new Map<ErrorContext, RateLimiter>();

  function contextAllows(context: ErrorContext): boolean {
    if (!deps.contextLimiter) return true;
    let limiter = contextLimiters.get(context);
    if (!limiter) {
      limiter = deps.contextLimiter();
      contextLimiters.set(context, limiter);
    }
    return limiter.tryAcquire(deps.now().getTime());
  }

  function currentId(): string | null {
    try {
      return deps.distinctId();
    } catch {
      return null; // can't tell whether the user opted in: assume not
    }
  }

  function body(
    distinctId: string,
    event: string,
    properties: Record<string, unknown>,
  ): string {
    return JSON.stringify({
      api_key: config?.apiKey,
      uuid: deps.newId(),
      event,
      distinct_id: distinctId,
      timestamp: deps.now().toISOString(),
      properties: {
        ...deps.common,
        ...properties,
        $lib: "health-tracker",
        // Which app sent it: all of Nino's apps share one PostHog project.
        app: "health-tracker",
        // Anonymous events only: no person profiles, no IP geolocation.
        $process_person_profile: false,
        $geoip_disable: true,
      },
    });
  }

  function post(payload: string, onSent?: () => void): void {
    if (!url || !deps.limiter.tryAcquire(deps.now().getTime())) return;
    deps
      .send(url, payload)
      .then(() => onSent?.())
      .catch(() => {});
  }

  return {
    captureError(error, context, options = {}) {
      try {
        if (!config) return;
        const distinctId = currentId();
        if (distinctId === null) return;
        if (!options.fatal && !contextAllows(context)) return;
        const handled = options.handled ?? true;
        const payload = body(distinctId, "$exception", {
          $exception_list: exceptionList(error, handled, options.headlineOnly),
          $exception_level: options.fatal ? "fatal" : "error",
          context,
          ...options.extra,
        });
        if (options.fatal && deps.pending) {
          deps.pending.save(payload);
          post(payload, () => deps.pending?.discard(payload));
        } else {
          post(payload);
        }
      } catch {
        // Telemetry must never become the app's problem.
      }
    },

    capture(event) {
      try {
        if (!config) return;
        const distinctId = currentId();
        if (distinctId === null) return;
        const { name, ...properties } = event;
        post(body(distinctId, name, properties));
      } catch {
        // as above
      }
    },

    flushPending() {
      try {
        const pending = deps.pending;
        const payload = pending?.peek();
        if (!pending || !payload || !config || currentId() === null) return;
        // Deleted only once it has gone through, so a failed send (offline at
        // launch) keeps it for the next one.
        post(payload, () => pending.discard(payload));
      } catch {
        // as above
      }
    },
  };
}
