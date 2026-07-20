import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import packageMetadata from "./package.json";

const appVersion = packageMetadata.version;

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, ".", "");
  const buildRevision = env.VITE_BUILD_REVISION || "working-tree";
  return ({
  base: "./",
  // Serve only the generated snapshot. The sibling config file contains a
  // local database path and must never become a public Vite asset.
  publicDir: command === "serve" ? ".visual-review/app17" : false,
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 1400,
    rollupOptions: {
      output: {
        manualChunks: {
          "vendor-3d": ["three", "@react-three/fiber", "@react-three/drei"],
        },
      },
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    __BUILD_REVISION__: JSON.stringify(buildRevision),
  },
  server: {
    host: "127.0.0.1",
    port: 5174,
    strictPort: true,
    watch: {
      ignored: ["**/src-tauri/**", "**/.pnpm-store/**", "**/.visual-review/**"],
    },
  },
  clearScreen: false,
  envPrefix: ["VITE_"],
  });
});
