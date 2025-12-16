import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  root: process.cwd(), // Explicitly set root to project root
  build: {
    outDir: "dist", // Ensure dist is at root level
  },
});
