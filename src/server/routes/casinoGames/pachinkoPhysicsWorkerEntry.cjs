// Piscina's actual worker entry point (plain CommonJS, no TypeScript syntax of its own).
//
// pachinkoPhysicsWorker.ts can't be pointed at directly: `tsx`'s own auto-registration (used by
// `npm run dev`/`npm start` to run the server with no separate build step) explicitly skips
// itself on any thread other than the main one (see node_modules/tsx/dist/esm/index.mjs -
// `isMainThread && register()`), so passing `--import tsx/esm` via Piscina's `execArgv` is a
// silent no-op inside a worker thread. `tsx/cjs`'s require-hook has no such guard, so this file
// registers it directly, then requires the real (TypeScript) worker module through it.
require("tsx/cjs");
module.exports = require("./pachinkoPhysicsWorker.ts").default;
