import Bugsnag from "@bugsnag/js";
import BugsnagPluginReact, { BugsnagErrorBoundary } from "@bugsnag/plugin-react";
import React from "react";

const apiKey = import.meta.env.VITE_BUGSNAG_API_KEY;
const releaseStage = import.meta.env.VITE_BUGSNAG_RELEASE_STAGE || "unknown";
// Must match the --app-version passed to `bugsnag-source-maps upload-browser` in the
// deploy workflow, or Bugsnag can't pair a reported event with its uploaded source map.
const appVersion = import.meta.env.VITE_BUGSNAG_APP_VERSION || "unknown";

let ErrorBoundary: BugsnagErrorBoundary | null = null;

if (apiKey) {
  Bugsnag.start({
    apiKey,
    appVersion,
    releaseStage,
    plugins: [new BugsnagPluginReact()],
  });
  const reactPlugin = Bugsnag.getPlugin("react");
  if (reactPlugin) {
    ErrorBoundary = reactPlugin.createErrorBoundary(React);
  }
}

export { Bugsnag, ErrorBoundary };
