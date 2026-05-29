import { test } from "node:test";
import assert from "node:assert/strict";
import { isProgrammaticObserverEnabled, observerLaneTick } from "./observer-lane.js";

test("isProgrammaticObserverEnabled defaults true unless LI_OBSERVER_DISABLE", () => {
  const prev = process.env.LI_OBSERVER_DISABLE;
  delete process.env.LI_OBSERVER_DISABLE;
  assert.equal(isProgrammaticObserverEnabled(), true);
  process.env.LI_OBSERVER_DISABLE = "1";
  assert.equal(isProgrammaticObserverEnabled(), false);
  if (prev === undefined) delete process.env.LI_OBSERVER_DISABLE;
  else process.env.LI_OBSERVER_DISABLE = prev;
});

test("observerLaneTick skips when observer disabled", async () => {
  const prev = process.env.LI_OBSERVER_DISABLE;
  process.env.LI_OBSERVER_DISABLE = "1";
  const tick = await observerLaneTick();
  assert.equal(tick.ok, false);
  assert.match(tick.skip_reason ?? "", /disabled/i);
  if (prev === undefined) delete process.env.LI_OBSERVER_DISABLE;
  else process.env.LI_OBSERVER_DISABLE = prev;
});
