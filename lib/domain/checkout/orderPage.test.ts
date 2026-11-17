import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { REFRESH_WINDOW_MS, nextRefreshDelay, shouldClearCheckoutState } from "./orderPage.ts";

const ORDER = "7f1c2b7e-1111-4222-8333-444455556666";
const OTHER = "8f1c2b7e-1111-4222-8333-444455556666";

describe("nextRefreshDelay", () => {
  it("starts quickly and backs off", () => {
    const delays = [0, 1, 2, 3, 4, 5].map((attempt) => nextRefreshDelay(0, attempt));
    for (let i = 1; i < delays.length; i++) assert.ok((delays[i] as number) >= (delays[i - 1] as number));
    assert.ok((delays[0] as number) >= 2_000);
  });

  it("caps the delay", () => {
    const capped = nextRefreshDelay(0, 50) as number;
    assert.ok(capped <= 30_000);
    assert.equal(capped, nextRefreshDelay(0, 99));
  });

  it("stops once the window is over", () => {
    assert.notEqual(nextRefreshDelay(REFRESH_WINDOW_MS - 1, 3), null);
    assert.equal(nextRefreshDelay(REFRESH_WINDOW_MS, 3), null);
    assert.equal(nextRefreshDelay(REFRESH_WINDOW_MS + 10_000, 0), null);
  });

  it("the window is a few minutes", () => {
    assert.ok(REFRESH_WINDOW_MS >= 3 * 60_000 && REFRESH_WINDOW_MS <= 10 * 60_000);
  });
});

describe("shouldClearCheckoutState", () => {
  it("clears when this order is paid and it is the order the browser was checking out", () => {
    assert.equal(shouldClearCheckoutState("paid", ORDER, ORDER), true);
  });

  it("never clears for an old paid order while the browser is building another one", () => {
    assert.equal(shouldClearCheckoutState("paid", OTHER, ORDER), false);
    assert.equal(shouldClearCheckoutState("paid", null, ORDER), false);
  });

  it("never clears unless the server says paid", () => {
    for (const state of ["pending", "processing", "rejected", "expired", "refunded"] as const) {
      assert.equal(shouldClearCheckoutState(state, ORDER, ORDER), false, state);
    }
  });
});
