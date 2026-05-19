import { test, expect } from "@playwright/test";

const RUN_ID = "playwright-mock-run";
const TOKEN = "playwright-mock-stream-token";

test.describe("live stream UI (mocked API)", () => {
  test.beforeEach(async ({ page }) => {
    let runPoll = 0;
    await page.route(`**/api/runs/${encodeURIComponent(RUN_ID)}`, async (route) => {
      runPoll += 1;
      const showTrace = runPoll >= 2;
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          run_id: RUN_ID,
          agent_id: "bug_fixer",
          status: "running",
          live: true,
          started_at: new Date().toISOString(),
          run_input: {
            user_message: "Playwright mocked user message",
            system_prompt: "system",
          },
          run_trace: showTrace
            ? {
                assistant_text: TOKEN,
                thinking_text: "mock thinking",
                tool_call_count: 0,
                steps: [],
                file_edits: [],
                deltas: [
                  {
                    seq: 0,
                    at: new Date().toISOString(),
                    type: "text-delta",
                    payload: { text: TOKEN },
                  },
                  {
                    seq: 1,
                    at: new Date().toISOString(),
                    type: "thinking-delta",
                    payload: { text: "mock thinking" },
                  },
                ],
              }
            : undefined,
        }),
      });
    });

    await page.route("**/api/activity/recent**", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          items: [
            {
              run_id: RUN_ID,
              agent_id: "bug_fixer",
              status: "running",
              live: true,
              started_at: new Date().toISOString(),
              action_summary: "Writing",
              output_snippet: TOKEN,
            },
          ],
        }),
      });
    });

    // Minimal stubs so the layout loads
    await page.route("**/api/status**", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          supervisor_status: "idle",
          runtime: { store: "disk", active_runs: [] },
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

  test("run drawer shows live stream deltas while run is live", async ({ page }) => {
    await page.goto(`/activity?run=${encodeURIComponent(RUN_ID)}`);

    await expect(page.getByTestId("run-drawer")).toBeVisible();
    await expect(page.getByTestId("live-stream-feed")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("live-stream-feed")).toContainText("text-delta");
    await expect(page.getByTestId("live-stream-feed")).toContainText(TOKEN);
    await expect(page.locator("[data-testid=live-delta-item]").first()).toBeVisible();
    await expect(page.getByText("Playwright mocked user message")).toBeVisible();
  });
});
