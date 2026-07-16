import { type HealthBackend } from "./types";

// Health Connect has no symptom or mood record types yet (Google announced
// them Dec 2025; rolling out through 2026). Until they ship, everything is
// local-only on Android — this backend exists so capability() has a truthful
// answer and the wiring is in place to light up per-kind later.
export const healthConnectBackend: HealthBackend = {
  name: "healthconnect",
  capability: () => "none",
  requestAuthorization: () => Promise.resolve(),
  write: () =>
    Promise.reject(new Error("Health Connect backend is read-only for now")),
  history: () => Promise.resolve([]),
};
