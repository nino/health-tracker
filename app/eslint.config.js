// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");

const EFFECTS = ["useEffect", "useLayoutEffect", "useInsertionEffect"];
const NO_EFFECTS =
  "Effects are banned outside src/ui/useMountEffect.ts. Derive state during render, act in the event handler, use a ref callback, remount with a key, or useMountEffect (with useEffectEvent for the latest props).";

module.exports = defineConfig([
  expoConfig,
  { ignores: ["dist/*"] },
  {
    // Lets useEffectEvent functions be called from inside useMountEffect.
    settings: { "react-hooks": { additionalEffectHooks: "^useMountEffect$" } },
    rules: {
      "import/no-default-export": "error",
      "no-restricted-imports": [
        "error",
        {
          paths: [{ name: "react", importNames: EFFECTS, message: NO_EFFECTS }],
        },
      ],
      "no-restricted-properties": [
        "error",
        ...EFFECTS.map((property) => ({
          object: "React",
          property,
          message: NO_EFFECTS,
        })),
      ],
    },
  },
  {
    // The one primitive allowed to call an effect.
    files: ["src/ui/useMountEffect.ts"],
    rules: { "no-restricted-imports": "off" },
  },
  {
    // Only where a framework genuinely demands a default export
    // (e.g. app.config.ts, or expo-router routes if we ever adopt it).
    files: ["app.config.*"],
    rules: { "import/no-default-export": "off" },
  },
]);
