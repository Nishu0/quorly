import { describe, expect, test } from "bun:test";
import { parseValue } from "../src/load-env";

describe("parseValue", () => {
  test("a quoted value ends at its closing quote, not at end of line", () => {
    // The exact shape that broke the Slack bot.
    expect(parseValue('"xapp-1-ABC"  # Socket Mode')).toBe("xapp-1-ABC");
  });

  test("strips matching single quotes too", () => {
    expect(parseValue("'secret'")).toBe("secret");
  });

  test("keeps a bare value intact", () => {
    expect(parseValue("xoxb-123")).toBe("xoxb-123");
  });

  test("strips a trailing comment from an unquoted value", () => {
    expect(parseValue("84532   # Base Sepolia")).toBe("84532");
  });

  test("does not treat a '#' inside a value as a comment", () => {
    expect(parseValue("pass#word")).toBe("pass#word");
  });

  test("preserves query strings and special characters in URLs", () => {
    expect(parseValue('"postgresql://u:p@h/db?sslmode=require&channel_binding=require"'))
      .toBe("postgresql://u:p@h/db?sslmode=require&channel_binding=require");
  });

  test("salvages an unterminated quote rather than returning garbage", () => {
    expect(parseValue('"xapp-1-ABC')).toBe("xapp-1-ABC");
  });
});
