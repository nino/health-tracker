// Imported first, as a bare import, by the entry files (index.ts,
// index.web.ts): evaluating it is the startup clock's "entry" mark. A bare
// import stays in place under Metro's inline requires, where an import whose
// bindings are used is deferred to its first use.
import { markStartup } from "./startupMarks";

markStartup("entry");
