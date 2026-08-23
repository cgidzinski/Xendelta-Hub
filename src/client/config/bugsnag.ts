import Bugsnag from "@bugsnag/js";
import BugsnagPluginReact, { BugsnagErrorBoundary } from "@bugsnag/plugin-react";
import React from "react";

const apiKey = import.meta.env.VITE_BUGSNAG_API_KEY;
const releaseStage = import.meta.env.VITE_BUGSNAG_RELEASE_STAGE || "unknown";

let ErrorBoundary: BugsnagErrorBoundary | null = null;

if (apiKey) {
  Bugsnag.start({
    apiKey,
    releaseStage,
    plugins: [new BugsnagPluginReact()],
  });
  const reactPlugin = Bugsnag.getPlugin("react");
  if (reactPlugin) {
    ErrorBoundary = reactPlugin.createErrorBoundary(React);
  }
}

export { Bugsnag, ErrorBoundary };
