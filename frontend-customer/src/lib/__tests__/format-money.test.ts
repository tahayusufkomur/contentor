import { describe, expect, it } from "vitest";
import { formatMoney, formatMoneyParts } from "../format";

describe("formatMoneyParts", () => {
  it("splits what formatMoney prints into symbol and amount", () => {
    expect(formatMoney("29.00", "EUR")).toBe("€29");
    expect(formatMoneyParts("29.00", "EUR")).toEqual({
      symbol: "€",
      amount: "29",
    });
    expect(formatMoneyParts("1299.5", "USD")).toEqual({
      symbol: "$",
      amount: "1,299.50",
    });
  });

  it("keeps a code-style symbol apart from the figure", () => {
    const { symbol, amount } = formatMoneyParts("49", "TRY");
    expect(symbol).toBe("TRY");
    expect(amount).toBe("49");
  });
});
