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

// Inline requires: a module is evaluated on first use instead of at bundle
// start, so code only the sheets need (charts and react-native-svg, the date
// picker, import/export) no longer runs during a cold start. Expo turns this
// off by default because it ignores import side effects; this app keeps every
// import whose side effect matters a bare `import "..."`, which stays in
// place (see index.ts).
const getTransformOptions = config.transformer.getTransformOptions;
config.transformer.getTransformOptions = async (...args) => {
  const options = await getTransformOptions(...args);
  return {
    ...options,
    transform: { ...options.transform, inlineRequires: true },
  };
};
