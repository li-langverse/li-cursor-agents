import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

export default async function globalSetup(): Promise<void> {
  const root = join(__dirname, "../..");

  execSync("npm run build", { cwd: root, stdio: "inherit" });

  if (process.env.LI_PLAYWRIGHT_USE_SUPABASE === "1") {
    try {
      execSync("npm run db:ensure", { cwd: root, stdio: "inherit" });
    } catch {
      console.warn("playwright: db:ensure failed — integration tests may skip");
    }
    if (existsSync(join(root, "dist/e2e/helpers.js"))) {
      execSync("node scripts/playwright-seed-live-run.mjs", {
        cwd: root,
        stdio: "inherit",
        env: { ...process.env, LI_PLAYWRIGHT_USE_SUPABASE: "1", LI_E2E_USE_SUPABASE: "1" },
      });
    }
  }
}
