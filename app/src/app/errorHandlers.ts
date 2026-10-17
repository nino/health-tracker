import { installErrorHandlers } from "./telemetry";

// Imported first by index.ts, so the handlers are in place before the app's
// own modules are evaluated and a crash while loading them is caught too.
installErrorHandlers();
