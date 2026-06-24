import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // "prompt": a newly deployed service worker is detected but NOT activated
      // automatically. We surface an update banner and only reload when the user
      // clicks it (see src/client/pwa/swUpdate.ts), so we never reload out from under
      // someone mid-action.
      registerType: "prompt",
      // We register the service worker manually in src/client/pwa/swUpdate.ts so we can
      // wire up the update banner and re-check for updates on launch/focus.
      injectRegister: false,
      workbox: {
        // Precache hashed static assets so repeat loads are fast and the app is installable.
        // This app requires a network connection to be useful, so there is intentionally no
        // offline navigation fallback or runtime caching of API/data requests — navigations and
        // /api/ calls always go straight to the server (also avoids the SW intercepting OAuth
        // navigations under /api/auth/*, which would otherwise serve index.html and 404).
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        // Main bundle is ~2 MB, just over Workbox's 2 MiB default; raise the limit so it precaches.
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        cleanupOutdatedCaches: true,
        // Disable the SPA navigation fallback. Without this, vite-plugin-pwa registers a
        // NavigationRoute that serves cached index.html for ALL navigations, hijacking
        // full-page navigations to /api/auth/* and breaking OAuth.
        navigateFallback: null,
      },
      manifest: false,
    }),
  ],
  root: process.cwd(),
  build: {
    outDir: "dist",
  },
});
