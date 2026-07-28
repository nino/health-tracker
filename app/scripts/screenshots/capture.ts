// PR-screenshot harness (see CLAUDE.md "Screenshots for PRs"). Serves the
// exported web build (`bunx expo export --platform web` first), drives it in
// headless Chromium, seeds demo data through the real Settings import, and
// writes phone-sized screenshots to docs/screenshots/ named
// `<date>-<short-sha>-<label>.png` — unique per capture, so PR image links
// never silently show a newer version.
//
//   cd app && bunx expo export --platform web && bun scripts/screenshots/capture.ts
import { chromium } from "playwright-core";

import { generateDemoExport } from "./demoData";

const appRoot = `${import.meta.dir}/../..`;
const outDir = process.env.OUT_DIR ?? `${appRoot}/../docs/screenshots`;
const chromiumPath = process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium"; // remote container
const sha = (
  await Bun.$`git rev-parse --short HEAD`.cwd(appRoot).text()
).trim();
const date = new Date().toISOString().slice(0, 10);
const name = (label: string) => `${outDir}/${date}-${sha}-${label}.png`;

// The web build needs cross-origin isolation: expo-sqlite's sync API runs on
// SharedArrayBuffer.
const server = Bun.serve({
  port: 0,
  async fetch(req) {
    const url = new URL(req.url);
    const file = Bun.file(
      `${appRoot}/dist${url.pathname === "/" ? "/index.html" : url.pathname}`,
    );
    if (!(await file.exists())) {
      return new Response("not found", { status: 404 });
    }
    return new Response(file, {
      headers: {
        "Cross-Origin-Opener-Policy": "same-origin",
        "Cross-Origin-Embedder-Policy": "require-corp",
      },
    });
  },
});

const browser = await chromium.launch({
  executablePath: chromiumPath,
  headless: true,
});
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
});
page.on("pageerror", (err) => console.error("page error:", err.message));

await page.goto(`http://127.0.0.1:${server.port}/`);
await page.getByText("Log Symptom").waitFor({ timeout: 20_000 });

// Seed through the real import flow so screenshots show real store reads.
await page.getByText("⚙️").click();
const chooserPromise = page.waitForEvent("filechooser");
await page.getByText("Import metric-log JSON (from the Swift app)").click();
await (
  await chooserPromise
).setFiles({
  name: "demo-export.json",
  mimeType: "application/json",
  buffer: Buffer.from(generateDemoExport()),
});
await page.getByText(/Imported \d+ entries/).waitFor({ timeout: 20_000 });
await page.getByText("Done").click();

await page.getByText("Mood").first().waitFor();
await page.waitForTimeout(500);
await page.screenshot({ path: name("main") });

await page.getByText("📈").click();
await page.getByText("History").waitFor();
await page.waitForTimeout(700); // charts + svg layout settle
await page.screenshot({ path: name("history-raw") });
await page.getByText("Day avg").click();
await page.waitForTimeout(400);
await page.screenshot({ path: name("history-day-avg") });
await page.getByText("Week avg").click();
await page.waitForTimeout(400);
await page.screenshot({ path: name("history-week-avg") });

await browser.close();
server.stop();
console.log(`wrote ${date}-${sha}-*.png to ${outDir}`);
