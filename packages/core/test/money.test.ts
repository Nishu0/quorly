import { describe, expect, test } from "bun:test";
import { caip2, fromBaseUnits, toBaseUnits, usd } from "../src/money";

describe("USDC base units", () => {
  test("converts dollars to 6-decimal base units", () => {
    expect(toBaseUnits("2400")).toBe("2400000000");
    expect(toBaseUnits("0.01")).toBe("10000");
  });

  test("round-trips without drift", () => {
    for (const v of ["2400", "0.01", "12345.67", "0.000001"]) {
      expect(fromBaseUnits(toBaseUnits(v))).toBe(String(Number(v)));
    }
  });

  test("does not lose precision on amounts past float safety", () => {
    expect(toBaseUnits("9007199254.740993")).toBe("9007199254740993");
  });
});

test("caip2 formats the chain id for Privy", () => {
  expect(caip2(84532)).toBe("eip155:84532");
});

test("usd formats for Slack and the dashboard", () => {
  expect(usd("2400")).toBe("$2,400.00");
});
