import { NativeModule, requireOptionalNativeModule } from "expo";

declare class ExpoHealthKitModule extends NativeModule {
  isHealthDataAvailable(): boolean;
}

// The native side only exists on Apple platforms; elsewhere this is null.
// The backend layer gates on platform before touching it.
export const HealthKit =
  requireOptionalNativeModule<ExpoHealthKitModule>("ExpoHealthKit");
