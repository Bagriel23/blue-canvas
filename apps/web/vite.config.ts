import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const apiUpstream = process.env["VITE_API_UPSTREAM"] ?? "http://127.0.0.1:8080";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": {
        target: apiUpstream,
        changeOrigin: false,
      },
    },
  },
  build: {
    outDir: "dist/client",
    sourcemap: true,
    target: "es2022",
  },
});
