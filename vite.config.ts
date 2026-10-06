import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    // The API server (server/index.ts) owns /api so the LLM key never reaches the browser.
    proxy: { "/api": "http://localhost:8787" },
  },
});
