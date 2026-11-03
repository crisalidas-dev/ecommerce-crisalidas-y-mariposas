import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildWeekSchedule, normalizeTime, parseWeekSchedule, WEEKDAY_ORDER } from "./businessHours.ts";

const day = (weekday: number, open: boolean, opensAt = "08:00", closesAt = "17:00") => ({
  weekday,
  open,
  opensAt,
  closesAt,
});

describe("normalizeTime", () => {
  it("trims seconds from Postgres time values", () => {
    assert.equal(normalizeTime("08:00:00"), "08:00");
    assert.equal(normalizeTime("13:30"), "13:30");
  });
  it("returns null for invalid values", () => {
    for (const v of ["", "25:00", "8:00", "ab:cd", null, undefined]) assert.equal(normalizeTime(v), null, String(v));
  });
});

describe("WEEKDAY_ORDER", () => {
  it("shows Monday first and Sunday last", () => {
    assert.deepEqual(WEEKDAY_ORDER, [1, 2, 3, 4, 5, 6, 0]);
  });
});

describe("buildWeekSchedule", () => {
  it("marks days without a row as closed, with default times", () => {
    const week = buildWeekSchedule([{ weekday: 1, opens_at: "08:00:00", closes_at: "17:30:00" }]);
    assert.equal(week.length, 7);
    assert.deepEqual(week[0], { weekday: 1, open: true, opensAt: "08:00", closesAt: "17:30" });
    const sunday = week[6];
    assert.equal(sunday.weekday, 0);
    assert.equal(sunday.open, false);
  });
});

describe("parseWeekSchedule", () => {
  it("splits open days to upsert and closed days to delete", () => {
    const r = parseWeekSchedule([day(1, true, "08:00", "17:00"), day(0, false)]);
    assert.ok(r.ok);
    assert.deepEqual(r.upserts, [{ weekday: 1, opens_at: "08:00", closes_at: "17:00" }]);
    assert.deepEqual(r.deletes, [0]);
  });
  it("rejects closes <= opens on an open day only", () => {
    const r = parseWeekSchedule([day(1, true, "17:00", "08:00"), day(2, true, "09:00", "09:00"), day(3, false, "17:00", "08:00")]);
    assert.ok(!r.ok);
    assert.deepEqual(Object.keys(r.errors).sort(), ["day:1", "day:2"]);
  });
  it("rejects missing times on an open day", () => {
    const r = parseWeekSchedule([day(4, true, "", "17:00")]);
    assert.ok(!r.ok && "day:4" in r.errors);
  });
  it("rejects invalid weekdays and duplicates", () => {
    assert.ok(!parseWeekSchedule([day(7, true)]).ok);
    assert.ok(!parseWeekSchedule([day(1, true), day(1, false)]).ok);
    assert.ok(!parseWeekSchedule("x").ok);
  });
});
