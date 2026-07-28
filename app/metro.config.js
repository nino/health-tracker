// eslint-disable-next-line @typescript-eslint/no-require-imports
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// expo-sqlite's web build ships wa-sqlite as a wasm asset; Metro doesn't
// treat .wasm as an asset by default. Web is used only as a screenshot
// harness (see CLAUDE.md) — the real app is the iOS/Android dev build.
config.resolver.assetExts.push("wasm");

// The wasm worker's synchronous API needs SharedArrayBuffer, which browsers
// only enable on cross-origin-isolated pages.
config.server.enhanceMiddleware = (middleware) => (req, res, next) => {
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
  return middleware(req, res, next);
};

module.exports = config;
