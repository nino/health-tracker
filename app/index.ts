// First: the startup clock's "entry" mark (see the file).
import "./src/app/startupEntry";
// Then the (opt-in) error-report handlers, before the app's own modules are
// evaluated, so a crash while loading them is caught too. Sends nothing
// unless the user switched it on.
import "./src/app/errorHandlers";

import { registerRootComponent } from "expo";

import { App } from "./App";
import { primeMainScreenQueries } from "./src/app/queries";
import { queryClient } from "./src/app/queryClient";
import { markStartup } from "./src/app/startupMarks";

markStartup("modulesLoaded");
// The main screen's data is in the cache before React renders, so the first
// frame is the finished grid.
primeMainScreenQueries(queryClient);
markStartup("storePrimed");

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
