import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import path from "node:path";

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
  // Same alias as tsconfig "paths": code shared by client and server lives in src/shared.
  resolve: { alias: { "@shared": path.resolve(process.cwd(), "src/shared") } },
  build: {
    outDir: "dist",
    // "hidden": .map files are generated but never referenced via a //# sourceMappingURL
    // comment, so browsers never fetch them and they aren't publicly linked - the deploy
    // workflow uploads them to Bugsnag directly from dist/ and deletes them afterward.
    sourcemap: "hidden",
    // MUI is one 760 kB chunk (about 220 kB gzipped) that changes only when MUI does. Warn if something else grows past this.
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        // The app's own entry chunk was ~960 kB because React, the router and MUI were all in it, which made every build
        // warn and meant any app change re-downloaded them. They change rarely, so they get their own long-lived chunks.
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (/node_modules\/(react|react-dom|react-router|react-router-dom|scheduler)\//.test(id)) return "react";
          if (/node_modules\/(@mui|@emotion)\//.test(id)) return "mui";
          return undefined;
        },
      },
    },
  },
});
