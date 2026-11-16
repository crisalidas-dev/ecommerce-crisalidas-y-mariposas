import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ABSOLUTE_LIFETIME_MS,
  IDLE_TIMEOUT_MS,
  REFRESH_INTERVAL_MS,
  encodeSession,
  evaluateSession,
  newSession,
  verifySession,
} from "./sessionPolicy.ts";

const SECRET = "test-secret-test-secret-test-secret-123";
const UID = "user-1";
const T0 = 1_700_000_000_000;

describe("session token", () => {
  it("round-trips a signed payload", async () => {
    const token = await encodeSession(newSession(UID, T0), SECRET);
    assert.deepEqual(await verifySession(token, SECRET), { uid: UID, iat: T0, last: T0 });
  });

  it("rejects a different secret, tampered payload and garbage", async () => {
    const token = await encodeSession(newSession(UID, T0), SECRET);
    assert.equal(await verifySession(token, "other-secret-other-secret-other-1234"), null);
    const [body, sig] = token.split(".");
    const forged = btoa(JSON.stringify({ uid: UID, iat: T0, last: T0 + 99 }))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    assert.equal(await verifySession(`${forged}.${sig}`, SECRET), null);
    assert.equal(await verifySession(`${body}.`, SECRET), null);
    assert.equal(await verifySession("nonsense", SECRET), null);
    assert.equal(await verifySession("", SECRET), null);
  });
});

describe("evaluateSession", () => {
  const eva = async (token: string | undefined, now: number, uid = UID) =>
    evaluateSession({ token, secret: SECRET, userId: uid, now });

  it("is missing without a cookie and invalid when tampered", async () => {
    assert.deepEqual(await eva(undefined, T0), { status: "missing" });
    assert.deepEqual(await eva("x.y", T0), { status: "invalid" });
  });

  it("accepts a fresh session without rewriting it", async () => {
    const token = await encodeSession(newSession(UID, T0), SECRET);
    assert.deepEqual(await eva(token, T0 + 1000), { status: "ok", refreshed: null });
  });

  it("slides lastActivity only after the refresh interval", async () => {
    const token = await encodeSession(newSession(UID, T0), SECRET);
    const r = await eva(token, T0 + REFRESH_INTERVAL_MS + 1);
    assert.equal(r.status, "ok");
    if (r.status === "ok") assert.deepEqual(r.refreshed, { uid: UID, iat: T0, last: T0 + REFRESH_INTERVAL_MS + 1 });
  });

  it("expires on idle", async () => {
    const token = await encodeSession(newSession(UID, T0), SECRET);
    assert.deepEqual(await eva(token, T0 + IDLE_TIMEOUT_MS), { status: "idle_expired" });
  });

  it("expires on absolute lifetime even when active", async () => {
    const token = await encodeSession({ uid: UID, iat: T0, last: T0 + ABSOLUTE_LIFETIME_MS - 1000 }, SECRET);
    assert.deepEqual(await eva(token, T0 + ABSOLUTE_LIFETIME_MS), { status: "absolute_expired" });
  });

  it("rejects a cookie that belongs to another user", async () => {
    const token = await encodeSession(newSession("someone-else", T0), SECRET);
    assert.deepEqual(await eva(token, T0 + 1000), { status: "user_mismatch" });
  });

  it("rejects timestamps from the future", async () => {
    const token = await encodeSession(newSession(UID, T0 + 10 * 60_000), SECRET);
    assert.deepEqual(await eva(token, T0), { status: "invalid" });
  });
});
