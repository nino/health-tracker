import { installErrorHandlers } from "./telemetry";

// Imported by index.ts right after the startup clock's entry mark (which
// imports nothing at runtime), so the handlers are in place before the app's
// own modules are evaluated and a crash while loading them is caught too.
installErrorHandlers();
