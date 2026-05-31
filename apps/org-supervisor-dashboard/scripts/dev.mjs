import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const api = spawn("node", ["server/index.mjs"], {
  cwd: root,
  stdio: "inherit",
  env: process.env,
});

const ui = spawn(
  process.platform === "win32" ? "npx.cmd" : "npx",
  ["vite"],
  { cwd: root, stdio: "inherit", env: process.env, shell: process.platform === "win32" },
);

function shutdown(code) {
  api.kill();
  ui.kill();
  process.exit(code ?? 0);
}

api.on("exit", (code) => shutdown(code ?? 1));
ui.on("exit", (code) => shutdown(code ?? 1));
process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
