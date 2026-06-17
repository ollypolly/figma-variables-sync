import { describe, it, expect } from "vitest";
import { figmaColorToHex } from "./figmaColorToHex";

describe("figmaColorToHex", () => {
  it("should convert a solid color", () => {
    expect(figmaColorToHex({ r: 1, g: 1, b: 1 })).toBe("#ffffff");
    expect(figmaColorToHex({ r: 0, g: 0, b: 0 })).toBe("#000000");
  });

  it("should convert an alpha color", () => {
    expect(figmaColorToHex({ r: 1, g: 0, b: 0, a: 0.5 })).toBe("#ff000080");
  });
});
