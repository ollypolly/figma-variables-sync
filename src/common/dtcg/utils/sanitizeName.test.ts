import { describe, it, expect } from "vitest";
import { sanitizeName } from "./sanitizeName";

describe("sanitizeName", () => {
  it("should replace slashes and dots with hyphens", () => {
    expect(sanitizeName("Brand/Core")).toBe("Brand-Core");
    expect(sanitizeName("primary.color")).toBe("primary-color");
  });

  it("should remove curly braces", () => {
    expect(sanitizeName("{alias-reference}")).toBe("alias-reference");
  });

  it("should replace whitespace with hyphens", () => {
    expect(sanitizeName(" trimmed space ")).toBe("trimmed-space");
    expect(sanitizeName("multiple   spaces")).toBe("multiple-spaces");
  });
});
