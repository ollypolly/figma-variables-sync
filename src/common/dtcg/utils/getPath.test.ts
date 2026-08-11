import { describe, it, expect } from "vitest";
import { getPath } from "./getPath";

describe("getPath", () => {
  it("returns the value at a nested path", () => {
    const obj = { Tokens: { brand: { primary: { $value: "#fff" } } } };
    expect(getPath(obj, ["Tokens", "brand", "primary"])).toEqual({ $value: "#fff" });
  });

  it("returns undefined when a segment along the way is missing", () => {
    const obj = { Tokens: { brand: {} } };
    expect(getPath(obj, ["Tokens", "brand", "primary"])).toBeUndefined();
  });
});
