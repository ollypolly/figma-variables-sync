import { describe, it, expect, vi } from "vitest";

vi.mock("@services/figmaMessages", () => ({ requestExport: vi.fn(), requestImport: vi.fn() }));

import { applySafeDiffsToFigmaJson } from "./applySafeDiffs";
import { computeSafeSubset } from "@services/gitSync";
import { color, dimension } from "@common/testUtils/tokens";

describe("applySafeDiffsToFigmaJson", () => {
  it("overlays a safe path's git value onto the Figma base, leaving an untouched sibling alone", () => {
    const figmaJson = JSON.stringify({
      Tokens: { brand: { primary: color("#000"), secondary: color("#f00") } },
    });
    const gitJson = JSON.stringify({
      Tokens: { brand: { primary: color("#fff"), secondary: color("#f00") } },
    });

    const result = applySafeDiffsToFigmaJson(figmaJson, gitJson, new Set(["Tokens.brand.primary"]));

    expect(JSON.parse(result)).toEqual({
      Tokens: { brand: { primary: color("#fff"), secondary: color("#f00") } },
    });
  });

  it("skips a safe path that's absent from git, never deleting the Figma value", () => {
    const figmaJson = JSON.stringify({
      Tokens: { brand: { primary: color("#000"), secondary: color("#f00") } },
    });
    const gitJson = JSON.stringify({ Tokens: { brand: { secondary: color("#f00") } } });

    const result = applySafeDiffsToFigmaJson(figmaJson, gitJson, new Set(["Tokens.brand.primary"]));

    expect(JSON.parse(result)).toEqual({
      Tokens: { brand: { primary: color("#000"), secondary: color("#f00") } },
    });
  });

  it("returns the Figma tree unchanged when safeDotPaths is empty", () => {
    const figmaJson = JSON.stringify({ Tokens: { brand: { primary: color("#000") } } });
    const gitJson = JSON.stringify({ Tokens: { brand: { primary: color("#fff") } } });

    const result = applySafeDiffsToFigmaJson(figmaJson, gitJson, new Set());

    expect(JSON.parse(result)).toEqual({ Tokens: { brand: { primary: color("#000") } } });
  });

  it("overlays a nested, grouped path the same as a top-level one", () => {
    const figmaJson = JSON.stringify({
      Tokens: { spacing: { group: { sm: dimension("4px") } } },
    });
    const gitJson = JSON.stringify({
      Tokens: { spacing: { group: { sm: dimension("8px") } } },
    });

    const result = applySafeDiffsToFigmaJson(figmaJson, gitJson, new Set(["Tokens.spacing.group.sm"]));

    expect(JSON.parse(result)).toEqual({
      Tokens: { spacing: { group: { sm: dimension("8px") } } },
    });
  });

  it("reproduces the intended sync end-to-end when safe paths come from computeSafeSubset's own output", () => {
    const oldGitJson = JSON.stringify({
      Tokens: {
        brand: {
          primary: color("#fff"),
          secondary: color("#f00"),
        },
      },
    });
    const newGitJson = JSON.stringify({
      Tokens: {
        brand: {
          primary: color("#000"), // changed on the new target — safe, no local drift
          secondary: color("#f00"), // unchanged
        },
      },
    });
    const figmaJson = JSON.stringify({
      Tokens: {
        brand: {
          primary: color("#fff"), // matches old git — no local drift
          secondary: color("#0f0"), // drifted locally — must stay untouched
        },
      },
    });

    const safeDotPaths = computeSafeSubset(oldGitJson, newGitJson, [
      { path: ["Tokens", "brand", "secondary"], dotPath: "Tokens.brand.secondary", type: "modified", figmaVal: "#0f0", gitVal: "#fff" },
    ]);
    const result = applySafeDiffsToFigmaJson(figmaJson, newGitJson, safeDotPaths);

    expect(JSON.parse(result)).toEqual({
      Tokens: {
        brand: {
          primary: color("#000"),
          secondary: color("#0f0"),
        },
      },
    });
  });
});
