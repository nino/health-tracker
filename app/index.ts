// First: installs the (opt-in) error-report handlers before the app's
// modules are evaluated. Sends nothing unless the user switched it on.
import "./src/app/errorHandlers";

import { registerRootComponent } from "expo";

import { App } from "./App";

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
