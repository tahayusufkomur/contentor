import { describe, expect, it } from "vitest";
import { formatDate, formatMoney } from "../format";
import {
  formatDateHeader,
  formatMonthYear,
  formatTime,
  weekdayNames,
} from "../calendar-utils";

describe("formatMoney", () => {
  it("follows the locale's separators and symbol position", () => {
    expect(formatMoney(49.5, "EUR", "de").replace(/\s/g, " ")).toBe("49,50 €");
    expect(formatMoney(1299.5, "USD", "en")).toBe("$1,299.50");
    expect(formatMoney(1299.5, "TRY", "tr")).toBe("₺1.299,50");
  });

  it("still drops the cents on a whole amount", () => {
    expect(formatMoney(49, "EUR", "de").replace(/\s/g, " ")).toBe("49 €");
  });
});

describe("formatDate", () => {
  it("names the month in the locale", () => {
    expect(formatDate("2026-11-05T10:00:00Z", "tr")).toContain("Kas");
    expect(formatDate("2026-11-05T10:00:00Z", "en")).toBe("Nov 5, 2026");
    expect(formatMonthYear(new Date(2026, 10, 5), "tr")).toBe("Kasım 2026");
  });
});

describe("weekdayNames", () => {
  it("starts on Monday, in the locale", () => {
    expect(weekdayNames("pl", "long")[0]).toBe("poniedziałek");
    expect(weekdayNames("tr", "short")[0]).toBe("Pzt");
    expect(weekdayNames("en", "short")).toEqual([
      "Mon",
      "Tue",
      "Wed",
      "Thu",
      "Fri",
      "Sat",
      "Sun",
    ]);
  });
});

describe("formatTime", () => {
  it("is 24-hour in the given zone and locale", () => {
    expect(formatTime("2026-07-18T06:00:00Z", "de", "Europe/Istanbul")).toBe(
      "09:00",
    );
  });
});

describe("formatDateHeader", () => {
  it("says today and tomorrow in the locale", () => {
    const iso = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const today = new Date();
    const tomorrow = new Date(today.getTime() + 86_400_000);
    expect(formatDateHeader(iso(today), "en")).toBe("Today");
    expect(formatDateHeader(iso(tomorrow), "en")).toBe("Tomorrow");
    expect(formatDateHeader(iso(today), "tr")).toBe("Bugün");
    expect(formatDateHeader(iso(tomorrow), "de")).toBe("Morgen");
  });
});
