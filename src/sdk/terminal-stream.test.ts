import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("terminalStreamEnabled", () => {
  it("respects LI_SDK_TERMINAL_STREAM=0", async () => {
    const prev = process.env.LI_SDK_TERMINAL_STREAM;
    process.env.LI_SDK_TERMINAL_STREAM = "0";
    const { terminalStreamEnabled } = await import("./terminal-stream.js");
    assert.equal(terminalStreamEnabled(), false);
    process.env.LI_SDK_TERMINAL_STREAM = prev;
  });

  it("respects LI_SDK_TERMINAL_STREAM=1", async () => {
    const prev = process.env.LI_SDK_TERMINAL_STREAM;
    process.env.LI_SDK_TERMINAL_STREAM = "1";
    const { terminalStreamEnabled } = await import("./terminal-stream.js");
    assert.equal(terminalStreamEnabled(), true);
    process.env.LI_SDK_TERMINAL_STREAM = prev;
  });
});
