import { Platform } from "react-native";

import { healthConnectBackend } from "./healthConnectBackend";
import { healthKitBackend } from "./healthKitBackend";
import { NULL_BACKEND, type HealthBackend } from "./types";

export {
  ensureAuthorization,
  importBackendHistory,
  mirrorPending,
} from "./sync";
export {
  NULL_BACKEND,
  type BackendSample,
  type Capability,
  type HealthBackend,
} from "./types";

export const activeBackend: HealthBackend =
  Platform.OS === "ios"
    ? healthKitBackend
    : Platform.OS === "android"
      ? healthConnectBackend
      : NULL_BACKEND;
