import { describe, it, expect } from "vitest";
import { deletePath } from "./deletePath";

describe("deletePath", () => {
  it("removes a leaf key, leaving siblings untouched", () => {
    const obj = { Tokens: { brand: { primary: { $value: "#fff" }, secondary: { $value: "#000" } } } };
    deletePath(obj, ["Tokens", "brand", "primary"]);
    expect(obj).toEqual({ Tokens: { brand: { secondary: { $value: "#000" } } } });
  });

  it("prunes a now-empty ancestor after removing its last child, but never deletes the root", () => {
    const obj = { Tokens: { brand: { primary: { $value: "#fff" } } }, Other: { x: 1 } };
    deletePath(obj, ["Tokens", "brand", "primary"]);
    expect(obj).toEqual({ Other: { x: 1 } });
  });

  it("is a no-op when the path doesn't exist", () => {
    const obj = { Tokens: { brand: { primary: { $value: "#fff" } } } };
    deletePath(obj, ["Tokens", "brand", "missing"]);
    expect(obj).toEqual({ Tokens: { brand: { primary: { $value: "#fff" } } } });
  });
});
