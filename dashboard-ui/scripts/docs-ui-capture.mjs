#!/usr/bin/env node
/** One-off docs UI capture for docs_ui_tester — local lic/site via file:// */
import { chromium, devices } from "playwright";
import { writeFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const BENCHMARKS =
  process.env.BENCHMARKS_ROOT ||
  join(dirname(fileURLToPath(import.meta.url)), "..");
const LIC_ROOT = process.env.LIC_ROOT || join(BENCHMARKS, "..", "lic");
const OUT = join(BENCHMARKS, "data", "latest-docs-ui-run", "artifacts", "lic-docs");
const siteDir = join(LIC_ROOT, "site");
const BASE = `file://${siteDir}/`;

const PAGES = [
  { id: "home", path: "" },
  { id: "hello-world", path: "guide/hello-world/" },
  { id: "provability-gaps", path: "verification/provability-gaps/" },
];

const VIEWPORTS = [
  { id: "desktop", width: 1280, height: 800 },
  { id: "mobile", ...devices["iPhone 13"] },
];

async function injectAxe(page) {
  await page.addScriptTag({
    url: "https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.10.3/axe.min.js",
  });
  return page.evaluate(async () => {
    // @ts-expect-error axe injected
    return await window.axe.run(document, {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
    });
  });
}

async function sampleContrast(page) {
  return page.evaluate(() => {
    const el = document.querySelector(".md-tabs__link");
    if (!el) return null;
    const s = getComputedStyle(el);
    const rgb = (c) => {
      const m = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      return m ? [+m[1], +m[2], +m[3]] : [0, 0, 0];
    };
    const lum = ([r, g, b]) => {
      const f = (x) => {
        x /= 255;
        return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const fg = rgb(s.color);
    const bg = rgb(s.backgroundColor);
    const L1 = lum(fg);
    const L2 = lum(bg);
    const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    return { selector: ".md-tabs__link", ratio: Math.round(ratio * 100) / 100 };
  });
}

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ headless: true });
const summary = {
  viewports: [],
  axe: [],
  contrast: [],
  generated_at: new Date().toISOString(),
};
let axeDone = false;

for (const pageDef of PAGES) {
  for (const vp of VIEWPORTS) {
    const ctx =
      vp.id === "mobile"
        ? await browser.newContext({ ...devices["iPhone 13"] })
        : await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const page = await ctx.newPage();
    const url = `${BASE}${pageDef.path}index.html`;
    await page.goto(url, { waitUntil: "domcontentloaded" });
    const png = join(OUT, `${pageDef.id}-${vp.id}.png`);
    await page.screenshot({ path: png, fullPage: false });
    summary.viewports.push({ page: pageDef.id, viewport: vp.id, artifact: png });

    const contrast = await sampleContrast(page);
    if (contrast) {
      summary.contrast.push({
        page: pageDef.id,
        viewport: vp.id,
        ...contrast,
        wcag_aa: contrast.ratio >= 4.5,
      });
    }

    if (!axeDone && pageDef.id === "home" && vp.id === "desktop") {
      const axe = await injectAxe(page);
      const byRule = {};
      for (const v of axe.violations || []) {
        byRule[v.id] = byRule[v.id] || { id: v.id, impact: v.impact, nodes: 0, help: v.help };
        byRule[v.id].nodes += v.nodes?.length || 0;
      }
      summary.axe = Object.values(byRule).filter((x) => x.impact === "serious" || x.impact === "critical");
      axeDone = true;
    }
    await ctx.close();
  }
}

await browser.close();
writeFileSync(join(OUT, "capture-summary.json"), JSON.stringify(summary, null, 2) + "\n");
console.log(JSON.stringify(summary, null, 2));
