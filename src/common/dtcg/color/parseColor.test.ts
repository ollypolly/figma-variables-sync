import { describe, it, expect } from "vitest";
import { parseColor } from "./parseColor";

describe("parseColor", () => {
  it("should parse 3-digit and 6-digit hex colors", () => {
    expect(parseColor("#fff")).toEqual({ r: 1, g: 1, b: 1, a: 1 });
    expect(parseColor("#ffffff")).toEqual({ r: 1, g: 1, b: 1, a: 1 });
  });

  it("should parse 4-digit and 8-digit hex colors with alpha channel", () => {
    expect(parseColor("#0008")).toEqual({ r: 0, g: 0, b: 0, a: 136/255 });
    expect(parseColor("#00000080")).toEqual({ r: 0, g: 0, b: 0, a: 128/255 });
  });

  it("should parse rgb and rgba colors", () => {
    expect(parseColor("rgb(255, 255, 255)")).toEqual({ r: 1, g: 1, b: 1, a: 1 });
    expect(parseColor("rgba(0, 0, 0, 0.5)")).toEqual({ r: 0, g: 0, b: 0, a: 0.5 });
  });

  it("should fallback to solid black on invalid formats", () => {
    expect(parseColor("invalid")).toEqual({ r: 0, g: 0, b: 0, a: 1 });
  });
});
