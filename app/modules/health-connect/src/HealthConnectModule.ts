import { NativeModule, requireOptionalNativeModule } from "expo";

import type { Enum } from "../../../src/lib/enum";

export const HealthConnectSdkStatus = {
  Unavailable: 1,
  UpdateRequired: 2,
  Available: 3,
} as const;
export type HealthConnectSdkStatus = Enum<typeof HealthConnectSdkStatus>;

declare class HealthConnectModule extends NativeModule {
  getSdkStatus(): HealthConnectSdkStatus;
}

// The native side only exists on Android; elsewhere this is null.
// The backend layer gates on platform before touching it.
export const HealthConnect =
  requireOptionalNativeModule<HealthConnectModule>("HealthConnect");
