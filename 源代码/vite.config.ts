import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import packageMetadata from "./package.json";

const appVersion = packageMetadata.version;
const AGENT_RECORDING_NAME = /^agent-background-(voyage|breath|signal)-(idle|input|answer|reading)-(auto|balanced|high)\.webm$/;
const MIN_AGENT_RECORDING_BYTES = 1024;
const MAX_AGENT_RECORDING_BYTES = 64 * 1024 * 1024;

function agentBackgroundRecordingPlugin(): Plugin {
  return {
    name: "agent-background-recording",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/__agent-background-recording", (request, response, next) => {
        if (request.method !== "POST") {
          next();
          return;
        }
        const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
        const filename = requestUrl.searchParams.get("name") ?? "";
        const origin = request.headers.origin;
        if (origin && origin !== "http://127.0.0.1:5174") {
          response.statusCode = 403;
          response.end("recording origin rejected");
          return;
        }
        if (!AGENT_RECORDING_NAME.test(filename)) {
          response.statusCode = 400;
          response.end("invalid recording name");
          return;
        }
        const chunks: Buffer[] = [];
        let byteLength = 0;
        let rejected = false;
        request.on("data", (chunk: Buffer) => {
          if (rejected) return;
          byteLength += chunk.byteLength;
          if (byteLength > MAX_AGENT_RECORDING_BYTES) {
            rejected = true;
            response.statusCode = 413;
            response.end("recording exceeds 64 MiB");
            request.destroy();
            return;
          }
          chunks.push(Buffer.from(chunk));
        });
        request.on("end", async () => {
          if (rejected) return;
          if (byteLength < MIN_AGENT_RECORDING_BYTES) {
            response.statusCode = 422;
            response.end("recording is too small");
            return;
          }
          const recording = Buffer.concat(chunks);
          if (
            recording[0] !== 0x1a
            || recording[1] !== 0x45
            || recording[2] !== 0xdf
            || recording[3] !== 0xa3
          ) {
            response.statusCode = 422;
            response.end("recording has an invalid WebM header");
            return;
          }
          try {
            const outputDir = join(process.cwd(), ".visual-review", "recordings");
            await mkdir(outputDir, { recursive: true });
            await writeFile(join(outputDir, filename), recording);
            response.statusCode = 200;
            response.setHeader("Content-Type", "application/json; charset=utf-8");
            response.end(JSON.stringify({
              path: `recordings/${filename}`,
              byteLength,
            }));
          } catch (error) {
            response.statusCode = 500;
            response.end(error instanceof Error ? error.message : "recording save failed");
          }
        });
      });
    },
  };
}

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, ".", "");
  const buildRevision = env.VITE_BUILD_REVISION || "working-tree";
  return ({
    base: "./",
    // Serve only the generated snapshot. The sibling config file contains a
    // local database path and must never become a public Vite asset.
    publicDir: command === "serve" ? ".visual-review/app17" : false,
    plugins: [react(), agentBackgroundRecordingPlugin()],
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
