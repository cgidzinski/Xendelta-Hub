import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // We hand-write the service worker (src/client/pwa/sw.ts) because a Workbox-generated
      // one cannot carry a "push" event listener. Everything the old generateSW `workbox`
      // block configured — precaching, cleanupOutdatedCaches, clientsClaim, no navigation
      // fallback, the SKIP_WAITING handler — now lives in that file. Read its comments
      // before changing it: they encode the OAuth and iOS-update fixes.
      strategies: "injectManifest",
      srcDir: "src/client/pwa",
      filename: "sw.ts",
      // "prompt": a newly deployed service worker is detected but NOT activated
      // automatically. We surface an update banner and only reload when the user
      // clicks it (see src/client/pwa/swUpdate.ts), so we never reload out from under
      // someone mid-action.
      registerType: "prompt",
      // We register the service worker manually in src/client/pwa/swUpdate.ts so we can
      // wire up the update banner and re-check for updates on launch/focus.
      injectRegister: false,
      injectManifest: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        // Main bundle is ~2 MB, just over Workbox's 2 MiB default; raise the limit so it precaches.
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
      manifest: false,
    }),
  ],
  root: process.cwd(),
  build: {
    outDir: "dist",
    // "hidden": .map files are generated but never referenced via a //# sourceMappingURL
    // comment, so browsers never fetch them and they aren't publicly linked - the deploy
    // workflow uploads them to Bugsnag directly from dist/ and deletes them afterward.
    sourcemap: "hidden",
  },
});
