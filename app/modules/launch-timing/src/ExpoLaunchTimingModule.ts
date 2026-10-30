import { NativeModule, requireOptionalNativeModule } from "expo";

/** Unix epoch milliseconds. */
export interface NativeLaunchTimes {
  processStart: number;
  mainStart: number;
  prewarmed: boolean;
  contentAppeared?: number;
}

declare class ExpoLaunchTimingModule extends NativeModule {
  launch(): NativeLaunchTimes | null;
}

// Apple platforms only; elsewhere this is null.
export const LaunchTiming =
  requireOptionalNativeModule<ExpoLaunchTimingModule>("ExpoLaunchTiming");
