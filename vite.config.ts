import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import fs from "fs";
import path from "path";
import tailwindcss from "@tailwindcss/vite";

// Voice activity detection loads its worklet, model and ONNX runtime by URL
// at runtime, so they must exist as plain files next to index.html.
const VAD_ASSETS: Record<string, string> = {
  "vad.worklet.bundle.min.js":
    "node_modules/@ricky0123/vad-web/dist/vad.worklet.bundle.min.js",
  "silero_vad_legacy.onnx":
    "node_modules/@ricky0123/vad-web/dist/silero_vad_legacy.onnx",
  "silero_vad_v5.onnx": "node_modules/@ricky0123/vad-web/dist/silero_vad_v5.onnx",
  "ort-wasm-simd-threaded.wasm":
    "node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm",
  "ort-wasm-simd-threaded.mjs":
    "node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.mjs",
};

const VAD_CONTENT_TYPES: Record<string, string> = {
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".wasm": "application/wasm",
  ".onnx": "application/octet-stream",
};

function vadAssets(): Plugin {
  const resolveAsset = (name: string) =>
    VAD_ASSETS[name] ? path.resolve(__dirname, VAD_ASSETS[name]) : null;

  return {
    name: "phantom-vad-assets",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url || "").split("?")[0];
        if (!url.startsWith("/vad/")) return next();
        const file = resolveAsset(url.slice("/vad/".length));
        if (!file || !fs.existsSync(file)) return next();
        res.setHeader(
          "Content-Type",
          VAD_CONTENT_TYPES[path.extname(file)] || "application/octet-stream"
        );
        fs.createReadStream(file).pipe(res);
      });
    },
    generateBundle() {
      for (const name of Object.keys(VAD_ASSETS)) {
        const file = resolveAsset(name);
        if (!file || !fs.existsSync(file)) {
          this.warn(`VAD asset missing: ${VAD_ASSETS[name]}`);
          continue;
        }
        this.emitFile({
          type: "asset",
          fileName: `vad/${name}`,
          source: fs.readFileSync(file),
        });
      }
    },
  };
}

// https://vite.dev/config/
export default defineConfig(async () => ({
  base: "./",
  plugins: [react(), tailwindcss(), vadAssets()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@tauri-apps/api/core": path.resolve(
        __dirname,
        "./src/lib/electron/tauri-core.ts"
      ),
      "@tauri-apps/api/event": path.resolve(
        __dirname,
        "./src/lib/electron/tauri-event.ts"
      ),
      "@tauri-apps/api/window": path.resolve(
        __dirname,
        "./src/lib/electron/tauri-window.ts"
      ),
      "@tauri-apps/api/webviewWindow": path.resolve(
        __dirname,
        "./src/lib/electron/tauri-webview-window.ts"
      ),
      "@tauri-apps/plugin-autostart": path.resolve(
        __dirname,
        "./src/lib/electron/plugin-autostart.ts"
      ),
      "@tauri-apps/plugin-http": path.resolve(
        __dirname,
        "./src/lib/electron/plugin-http.ts"
      ),
      "@tauri-apps/plugin-opener": path.resolve(
        __dirname,
        "./src/lib/electron/plugin-opener.ts"
      ),
      "@tauri-apps/plugin-process": path.resolve(
        __dirname,
        "./src/lib/electron/plugin-process.ts"
      ),
      "@tauri-apps/plugin-sql": path.resolve(
        __dirname,
        "./src/lib/electron/plugin-sql.ts"
      ),
      "@tauri-apps/plugin-updater": path.resolve(
        __dirname,
        "./src/lib/electron/plugin-updater.ts"
      ),
      "tauri-plugin-posthog-api": path.resolve(
        __dirname,
        "./src/lib/electron/posthog.ts"
      ),
      "tauri-plugin-macos-permissions-api": path.resolve(
        __dirname,
        "./src/lib/electron/macos-permissions.ts"
      ),
    },
  },
  clearScreen: false,
  build: {
    chunkSizeWarningLimit: 10000,
  },
  server: {
    port: Number(process.env.PHANTOM_DEV_PORT || 1420),
    strictPort: true,
  },
}));
