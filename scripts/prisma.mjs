import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import nextEnv from "@next/env";

const projectDirectory = fileURLToPath(new URL("..", import.meta.url));
const require = createRequire(import.meta.url);
const prismaCli = require.resolve("prisma/build/index.js");
const { loadEnvConfig } = nextEnv;

loadEnvConfig(projectDirectory, true);

const result = spawnSync(
  process.execPath,
  [prismaCli, ...process.argv.slice(2)],
  {
    cwd: projectDirectory,
    env: process.env,
    stdio: "inherit",
  },
);

if (result.error) {
  throw result.error;
}

process.exitCode = result.status ?? 1;
