import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test, expect } from "@playwright/test";

const fixturePath = join(__dirname, "../.playwright/fixture.json");
const hasSupabaseFixture =
  process.env.LI_PLAYWRIGHT_USE_SUPABASE === "1" && existsSync(fixturePath);

const describeIntegration = hasSupabaseFixture ? test.describe : test.describe.skip;

describeIntegration("live stream UI (Supabase integration)", () => {
  const fixture = hasSupabaseFixture
    ? (JSON.parse(readFileSync(fixturePath, "utf8")) as {
        runId: string;
        agentId: string;
        token: string;
      })
    : { runId: "", agentId: "", token: "" };

  test.beforeEach(async ({ page }) => {
    await page.route("**/api/status**", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          supervisor_status: "idle",
          runtime: { store: "supabase", active_runs: [] },
        }),
      });
    });
    await page.route("**/api/agents**", async (route) => {
      if (route.request().method() !== "GET") return route.continue();
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ agents: [], runtime: { active_runs: [] } }),
      });
    });
  });

  test("run drawer loads streamed deltas from test database", async ({ page }) => {
    await page.goto(`/activity?run=${encodeURIComponent(fixture.runId)}`);

    await expect(page.getByTestId("run-drawer")).toBeVisible();
    const feed = page.getByTestId("live-stream-feed");
    await expect(feed).toBeVisible({ timeout: 20_000 });
    await expect(feed).toContainText(fixture.token, { timeout: 20_000 });
    await expect(feed).toContainText("text-delta");
    await expect(page.locator("[data-testid=live-delta-item]").first()).toBeVisible();
  });

  test("activity feed lists live run and opens live trace from card", async ({ page }) => {
    await page.goto("/activity");
    const card = page.locator(`article[data-run-id="${fixture.runId}"]`);
    await expect(card).toBeVisible({ timeout: 20_000 });
    await expect(card.getByText(/Writing|Tool:|Thinking|Prompt sent/)).toBeVisible();
    await card.getByRole("button", { name: /Full trace/ }).click();
    await expect(page.getByTestId("live-stream-feed")).toContainText(fixture.token);
  });
});
