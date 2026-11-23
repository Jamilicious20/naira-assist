import { formatNaira, formatTxnDate } from "@/lib/format";

describe("formatNaira", () => {
  it("formats kobo with thousands separators", () => {
    expect(formatNaira(22_000_000)).toBe("₦220,000.00");
    expect(formatNaira(123_456_789)).toBe("₦1,234,567.89");
    expect(formatNaira(5)).toBe("₦0.05");
  });

  it("handles negatives", () => {
    expect(formatNaira(-150)).toBe("-₦1.50");
  });
});

describe("formatTxnDate", () => {
  const now = new Date(2026, 10, 23, 15, 0);
  it("labels recent days", () => {
    expect(formatTxnDate(new Date(2026, 10, 23, 1, 0).toISOString(), now)).toBe("Today");
    expect(formatTxnDate(new Date(2026, 10, 22, 23, 0).toISOString(), now)).toBe("Yesterday");
    expect(formatTxnDate(new Date(2026, 10, 12, 9, 0).toISOString(), now)).toBe("12 Nov");
  });
});
