import Bugsnag from "@bugsnag/js";
import BugsnagPluginExpress from "@bugsnag/plugin-express";
import { execSync } from "child_process";

const apiKey = process.env.BUGSNAG_API_KEY;

function getAppVersion(): string {
  try {
    return execSync("git rev-parse HEAD", { cwd: process.cwd() }).toString().trim();
  } catch {
    return "unknown";
  }
}

if (apiKey) {
  Bugsnag.start({
    apiKey,
    appVersion: getAppVersion(),
    releaseStage: "production",
    plugins: [BugsnagPluginExpress],
  });
}

export default Bugsnag;
