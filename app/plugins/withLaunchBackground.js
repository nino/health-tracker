// Paints everything iOS shows before React's first frame in the app's own
// background (theme.background: #f2f2f7 light, #000000 dark — exactly
// UIColor.systemGroupedBackground), instead of white:
//
// - the launch screen (SplashScreen.storyboard from the prebuild template,
//   which uses systemBackgroundColor), and
// - React Native's root view, which RCTRootViewFactory also creates with
//   systemBackgroundColor and which is all that's visible from the moment
//   the launch screen goes away until the JS bundle has rendered.
//
// A cold start then reads as the app's background followed by its content,
// not a white flash. Android is left alone for now.
const { withAppDelegate, withDangerousMod } = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

const BACKGROUND = "systemGroupedBackgroundColor";

const STORYBOARD_COLOR =
  '<color key="backgroundColor" systemColor="systemBackgroundColor"/>';
const STORYBOARD_RESOURCE =
  /<systemColor name="systemBackgroundColor">\s*<color [^>]*\/>\s*<\/systemColor>/;

const DELEGATE_ANCHOR =
  "class ReactNativeDelegate: ExpoReactNativeFactoryDelegate {\n  // Extension point for config-plugins\n";
const CUSTOMIZE = `
  // Added by plugins/withLaunchBackground.js: the app's background color
  // instead of white until React's first frame.
  override func customize(_ rootView: UIView) {
    super.customize(rootView)
    rootView.backgroundColor = .systemGroupedBackground
  }
`;

function fail(what) {
  throw new Error(
    `withLaunchBackground: couldn't find ${what}; the Expo template changed, update the plugin.`,
  );
}

function withLaunchBackground(config) {
  config = withAppDelegate(config, (config) => {
    let src = config.modResults.contents;
    if (!src.includes("rootView.backgroundColor = .systemGroupedBackground")) {
      if (!src.includes(DELEGATE_ANCHOR)) fail("ReactNativeDelegate");
      src = src.replace(DELEGATE_ANCHOR, DELEGATE_ANCHOR + CUSTOMIZE);
    }
    config.modResults.contents = src;
    return config;
  });

  return withDangerousMod(config, [
    "ios",
    async (config) => {
      const file = path.join(
        config.modRequest.platformProjectRoot,
        config.modRequest.projectName,
        "SplashScreen.storyboard",
      );
      let xml = fs.readFileSync(file, "utf8");
      if (!xml.includes(`systemColor="${BACKGROUND}"`)) {
        if (!xml.includes(STORYBOARD_COLOR)) fail("the launch screen color");
        if (!STORYBOARD_RESOURCE.test(xml)) fail("the launch screen resource");
        // The resource entry is Interface Builder's design-time stand-in;
        // at runtime the named system color is used, in light and dark.
        xml = xml
          .replace(
            STORYBOARD_COLOR,
            `<color key="backgroundColor" systemColor="${BACKGROUND}"/>`,
          )
          .replace(
            STORYBOARD_RESOURCE,
            `<systemColor name="${BACKGROUND}">\n            <color red="0.94901960784313721" green="0.94901960784313721" blue="0.96862745098039216" alpha="1" colorSpace="custom" customColorSpace="sRGB"/>\n        </systemColor>`,
          );
        fs.writeFileSync(file, xml);
      }
      return config;
    },
  ]);
}

module.exports = withLaunchBackground;
