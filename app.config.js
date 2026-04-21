const appJson = require("./app.json");

function isSentryPlugin(plugin) {
  return Array.isArray(plugin)
    ? plugin[0] === "@sentry/react-native/expo"
    : plugin === "@sentry/react-native/expo";
}

module.exports = () => {
  const expoConfig = appJson.expo;
  const buildProfile = process.env.EAS_BUILD_PROFILE;
  const disableSentryForThisBuild =
    buildProfile === "preview" ||
    process.env.SENTRY_DISABLE_AUTO_UPLOAD === "true";

  return {
    ...expoConfig,
    plugins: disableSentryForThisBuild
      ? (expoConfig.plugins || []).filter((plugin) => !isSentryPlugin(plugin))
      : expoConfig.plugins,
  };
};
