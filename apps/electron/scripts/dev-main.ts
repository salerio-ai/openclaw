import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = resolve(fileURLToPath(import.meta.url), "..");

const electronPath = resolve(__dirname, "../node_modules/.bin/electron");
const mainScript = resolve(__dirname, "../src/main/index.ts");

const electronProcess = spawn(electronPath, [mainScript], {
  stdio: "inherit",
  env: {
    ...process.env,
    NODE_ENV: "development",
  },
});

electronProcess.on("exit", (code) => {
  process.exit(code ?? 0);
});
