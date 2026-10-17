import { registerRootComponent } from "expo";

import { App } from "./App";
import { installErrorHandlers } from "./src/app/telemetry";

// Before anything else runs, so startup errors are caught too. It only
// sends anything if the user opted in to error reports in Settings.
installErrorHandlers();

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
