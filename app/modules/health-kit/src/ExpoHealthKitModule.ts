import { NativeModule, requireOptionalNativeModule } from "expo";

export interface HKCategorySample {
  uuid: string;
  value: number;
  dateMs: number;
}

export interface HKStateOfMindSample {
  uuid: string;
  valence: number;
  dateMs: number;
}

declare class ExpoHealthKitModule extends NativeModule {
  isHealthDataAvailable(): boolean;
  requestAuthorization(identifiers: string[]): Promise<void>;
  saveCategorySample(
    identifier: string,
    value: number,
    dateMs: number,
  ): Promise<string>;
  saveStateOfMind(valence: number, dateMs: number): Promise<string>;
  categorySamples(identifier: string): Promise<HKCategorySample[]>;
  stateOfMindSamples(): Promise<HKStateOfMindSample[]>;
}

// The native side only exists on Apple platforms; elsewhere this is null.
// The backend layer gates on platform before touching it.
export const HealthKit =
  requireOptionalNativeModule<ExpoHealthKitModule>("ExpoHealthKit");
