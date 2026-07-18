const os = require("os");
const path = require("path");

const HOME = os.homedir();

module.exports = {
  apps: [
    {
      name: "xendelta-hub",
      cwd: path.join(HOME, "xendelta-hub-prod"),
      script: "npm",
      args: "start",
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      max_restarts: 10,
    },
    {
      name: "xendelta-hub-staging",
      cwd: path.join(HOME, "xendelta-hub-staging"),
      script: "npm",
      args: "start",
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      max_restarts: 10,
    },
  ],
};
