import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
  },
  server: {
    port: 3000,
    proxy: {
      // In dev, proxy API calls to the local backend
      "/api": {
        target: "http://localhost:10000",
        changeOrigin: true,
      },
    },
  },
});
