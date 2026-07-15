// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  { ignores: ["dist/*"] },
  { rules: { "import/no-default-export": "error" } },
  {
    // Only where a framework genuinely demands a default export
    // (e.g. app.config.ts, or expo-router routes if we ever adopt it).
    files: ["app.config.*"],
    rules: { "import/no-default-export": "off" },
  },
]);
