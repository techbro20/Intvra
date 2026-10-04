import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import http from "node:http";
import net from "node:net";
import path from "node:path";

const HOST = "127.0.0.1";
const PORTS = [1420, 1421, 1422, 1423];
const require = createRequire(import.meta.url);
const electronPath = require("electron");
const vitePackagePath = require.resolve("vite/package.json");
const viteBinPath = path.join(path.dirname(vitePackagePath), "bin", "vite.js");

function isPortFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, HOST);
  });
}

async function pickPort() {
  for (const port of PORTS) {
    if (await isPortFree(port)) {
      return port;
    }
  }
  throw new Error(`No free Ai.Intvra dev port found. Tried: ${PORTS.join(", ")}`);
}

function waitForUrl(url) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + 30_000;

    const check = () => {
      const request = http.get(url, (response) => {
        response.resume();
        resolve();
      });

      request.on("error", () => {
        if (Date.now() > deadline) {
          reject(new Error(`Timed out waiting for ${url}`));
          return;
        }
        setTimeout(check, 300);
      });
    };

    check();
  });
}

function spawnProcess(command, args, env = {}) {
  return spawn(command, args, {
    cwd: process.cwd(),
    env: { ...process.env, ...env },
    stdio: "inherit",
  });
}

const port = await pickPort();
const devUrl = `http://${HOST}:${port}`;

console.log(`Ai.Intvra dev server using ${devUrl}`);

const vite = spawnProcess(
  process.execPath,
  [viteBinPath, "--host", HOST, "--port", String(port), "--strictPort"],
  {
    PHANTOM_DEV_PORT: String(port),
  }
);
let electron;
let shuttingDown = false;

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  if (electron && !electron.killed) electron.kill();
  if (vite && !vite.killed) vite.kill();
  process.exit(code);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

vite.on("exit", (code) => {
  if (!shuttingDown) shutdown(code ?? 1);
});

await waitForUrl(devUrl);

electron = spawnProcess(electronPath, ["."], {
  PHANTOM_DEV_URL: devUrl,
});

electron.on("exit", (code) => {
  shutdown(code ?? 0);
});
