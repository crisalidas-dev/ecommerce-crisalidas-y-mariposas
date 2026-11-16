import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createLoginThrottle } from "./loginThrottle.ts";

const opts = { ipLimit: 4, emailLimit: 2, windowMs: 1000, now: () => 0 };

describe("login throttle", () => {
  it("blocks an email after its failed-attempt budget, whatever the casing", () => {
    const t = createLoginThrottle(opts);
    assert.equal(t.attempt("1.1.1.1", "A@x.com").allowed, true);
    assert.equal(t.attempt("1.1.1.1", " a@X.com ").allowed, true);
    assert.equal(t.attempt("1.1.1.1", "a@x.com").allowed, false);
  });

  it("blocks an IP across different emails", () => {
    const t = createLoginThrottle(opts);
    for (const e of ["a", "b", "c", "d"]) assert.equal(t.attempt("9.9.9.9", `${e}@x.com`).allowed, true);
    assert.equal(t.attempt("9.9.9.9", "e@x.com").allowed, false);
    assert.equal(t.attempt("8.8.8.8", "e@x.com").allowed, true);
  });

  it("a success clears the email bucket", () => {
    const t = createLoginThrottle(opts);
    t.attempt("1.1.1.1", "a@x.com");
    t.attempt("1.1.1.1", "a@x.com");
    t.succeeded("a@x.com");
    assert.equal(t.attempt("1.1.1.1", "a@x.com").allowed, true);
  });

  it("an IP-blocked attempt does not burn the email budget", () => {
    const t = createLoginThrottle({ ...opts, ipLimit: 1 });
    t.attempt("1.1.1.1", "a@x.com");
    assert.equal(t.attempt("1.1.1.1", "a@x.com").allowed, false);
    assert.equal(t.attempt("2.2.2.2", "a@x.com").allowed, true);
  });
});
