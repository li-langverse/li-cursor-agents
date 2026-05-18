import assert from "node:assert/strict";
import test from "node:test";
import { parseDisplayContent, previewPlainText } from "./parse-display-content.js";

test("parseDisplayContent detects markdown headings", () => {
  const p = parseDisplayContent("## Queued task\n\nDo the thing");
  assert.equal(p.kind, "markdown");
});

test("parseDisplayContent unwraps JSON string markdown", () => {
  const p = parseDisplayContent(JSON.stringify({ text: "# Hello\n\nWorld" }));
  assert.equal(p.kind, "markdown");
  assert.match(p.text, /Hello/);
});

test("parseDisplayContent keeps structured JSON as json", () => {
  const p = parseDisplayContent(JSON.stringify({ ok: true, items: [1, 2] }));
  assert.equal(p.kind, "json");
  assert.deepEqual(p.json, { ok: true, items: [1, 2] });
});

test("previewPlainText strips markdown for cards", () => {
  const s = previewPlainText("## Title\n\n**bold** body");
  assert.ok(!s.includes("##"));
  assert.match(s, /Title/);
});
