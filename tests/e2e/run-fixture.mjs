import { spawn } from "node:child_process";
import { rmSync } from "node:fs";
import { fileURLToPath } from "node:url";

const playwrightCli = fileURLToPath(
  new URL("../../node_modules/playwright/cli.js", import.meta.url),
);
const fixtureStatePath = fileURLToPath(
  new URL("../../test-results/tutorlab-fixture-state.json", import.meta.url),
);

rmSync(fixtureStatePath, { force: true });

const child = spawn(
  process.execPath,
  [playwrightCli, "test", "tests/e2e/day-1-day-2.spec.ts"],
  {
    env: {
      ...process.env,
      NEXT_TELEMETRY_DISABLED: "1",
      PLAYWRIGHT_FIXTURE_MODE: "1",
      PROJECT_EDIT_TOKEN_SECRET: "fixture-secret-for-day-one-day-two",
      TUTORLAB_FIXTURE_MODE: "1",
      TUTORLAB_FIXTURE_STATE_PATH: fixtureStatePath,
    },
    stdio: "inherit",
  },
);

child.on("exit", (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0);
});
