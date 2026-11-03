import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatHolidayDate, mapHolidayDbError, parseHolidayInput } from "./holidays.ts";

const TODAY = "2026-11-03";

describe("parseHolidayInput", () => {
  it("accepts today and future dates and trims the name", () => {
    const r = parseHolidayInput({ date: "2026-11-03", name: "  Festivo  " }, TODAY);
    assert.deepEqual(r, { ok: true, data: { holiday_date: "2026-11-03", name: "Festivo" } });
    assert.ok(parseHolidayInput({ date: "2027-01-01", name: "Año Nuevo" }, TODAY).ok);
  });
  it("rejects past dates", () => {
    const r = parseHolidayInput({ date: "2026-11-02", name: "x" }, TODAY);
    assert.ok(!r.ok && "date" in r.errors);
  });
  it("rejects malformed or impossible dates", () => {
    for (const date of ["", "03/11/2026", "2026-02-30", "2026-13-01", undefined]) {
      const r = parseHolidayInput({ date, name: "x" }, TODAY);
      assert.ok(!r.ok && "date" in r.errors, String(date));
    }
  });
  it("requires a name of at most 100 characters", () => {
    assert.ok(!parseHolidayInput({ date: "2026-12-08", name: "  " }, TODAY).ok);
    assert.ok(!parseHolidayInput({ date: "2026-12-08", name: "x".repeat(101) }, TODAY).ok);
  });
});

describe("mapHolidayDbError", () => {
  it("explains duplicates", () => {
    assert.match(mapHolidayDbError({ code: "23505", message: "dup" }), /ya está registrado/);
  });
  it("explains missing permissions", () => {
    assert.match(mapHolidayDbError({ code: "42501", message: "permission denied" }), /permiso/i);
  });
  it("falls back to a generic message", () => {
    assert.match(mapHolidayDbError({ message: "boom" }), /No se pudo/);
  });
});

describe("formatHolidayDate", () => {
  it("renders a Spanish long date without timezone drift", () => {
    const text = formatHolidayDate("2026-12-08");
    assert.match(text, /8/);
    assert.match(text, /diciembre/i);
  });
});
