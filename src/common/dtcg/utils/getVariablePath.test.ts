import { describe, it, expect } from "vitest";
import { getVariablePath } from "./getVariablePath";

describe("getVariablePath", () => {
  it("should build standard path from collection and variable names", () => {
    expect(getVariablePath("Colors", "primary/blue/500")).toBe("Colors.primary.blue.500");
  });

  it("should fallback to 'library' when collectionName is undefined", () => {
    expect(getVariablePath(undefined, "spacing/medium")).toBe("library.spacing.medium");
  });

  it("should sanitize names inside the path", () => {
    expect(getVariablePath("Brand Collection", "neutral/dark.gray")).toBe("Brand-Collection.neutral.dark-gray");
  });
});
