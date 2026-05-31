import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: Number(process.env.ORG_SUPERVISOR_DASHBOARD_UI_PORT || 5174),
    proxy: {
      "/api": {
        target: `http://127.0.0.1:${process.env.ORG_SUPERVISOR_DASHBOARD_API_PORT || 9478}`,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
