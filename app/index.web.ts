import { registerRootComponent } from "expo";
import { openDatabaseAsync } from "expo-sqlite";

import { App } from "./App";

// Web is not a shipping target — it exists so PR screenshots can be captured
// in a headless browser (see CLAUDE.md). expo-sqlite's synchronous web API
// waits on its wasm worker with a *bounded* spin and throws if the worker
// isn't up yet — guaranteed on a cold start. So: warm the worker with an
// async open first (and close again; OPFS access handles are exclusive), and
// only mount the app once the synchronous API is safe. appDb opens lazily on
// first use (after mount), never at module scope.
void (async () => {
  const db = await openDatabaseAsync("health-tracker.db");
  await db.closeAsync();
  registerRootComponent(App);
})();
