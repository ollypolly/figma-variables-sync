import { describe, it, expect } from "vitest";
import { applyStagedDiffs } from "./applyStagedDiffs";
import { computeDiff } from "./diff";
import { color, dimension } from "@common/testUtils/tokens";

describe("applyStagedDiffs", () => {
  it("writes a staged path's raw Figma subtree onto the base tree, leaving the rest unchanged", () => {
    const baseJson = JSON.stringify({ Tokens: { brand: { primary: color("#fff") } } });
    const figmaJson = JSON.stringify({
      Tokens: {
        brand: {
          primary: color("#fff"),
          secondary: color("#f00"),
        },
      },
    });

    const result = applyStagedDiffs(baseJson, figmaJson, new Set(["Tokens.brand.secondary"]));

    expect(JSON.parse(result)).toEqual({
      Tokens: {
        brand: {
          primary: color("#fff"),
          secondary: color("#f00"),
        },
      },
    });
  });

  it("replaces a staged token's value while preserving an unrelated, untouched sibling token", () => {
    const baseJson = JSON.stringify({
      Tokens: {
        brand: {
          primary: color("#fff"),
          secondary: color("#f00"),
        },
      },
    });
    const figmaJson = JSON.stringify({
      Tokens: {
        brand: {
          primary: color("#000"),
          secondary: color("#f00"),
        },
      },
    });

    const result = applyStagedDiffs(baseJson, figmaJson, new Set(["Tokens.brand.primary"]));

    expect(JSON.parse(result)).toEqual({
      Tokens: {
        brand: {
          primary: color("#000"),
          secondary: color("#f00"),
        },
      },
    });
  });

  it("removes a staged path that no longer exists in Figma, leaving everything else untouched", () => {
    const baseJson = JSON.stringify({
      Tokens: {
        brand: {
          primary: color("#fff"),
          secondary: color("#f00"),
        },
      },
    });
    const figmaJson = JSON.stringify({
      Tokens: { brand: { secondary: color("#f00") } },
    });

    const result = applyStagedDiffs(baseJson, figmaJson, new Set(["Tokens.brand.primary"]));

    expect(JSON.parse(result)).toEqual({
      Tokens: { brand: { secondary: color("#f00") } },
    });
  });

  it("prunes a group left empty by deleting its last token, leaving a sibling collection untouched", () => {
    const baseJson = JSON.stringify({
      Tokens: { brand: { primary: color("#fff") } },
      Other: { spacing: { sm: dimension("4px") } },
    });
    const figmaJson = JSON.stringify({
      Other: { spacing: { sm: dimension("4px") } },
    });

    const result = applyStagedDiffs(baseJson, figmaJson, new Set(["Tokens.brand.primary"]));

    expect(JSON.parse(result)).toEqual({
      Other: { spacing: { sm: dimension("4px") } },
    });
  });

  it("preserves a token's $description when its path isn't staged", () => {
    const baseJson = JSON.stringify({
      Tokens: {
        brand: {
          primary: color("#fff", { $description: "The brand primary color." }),
          secondary: color("#f00"),
        },
      },
    });
    const figmaJson = JSON.stringify({
      Tokens: {
        brand: {
          primary: color("#fff", { $description: "The brand primary color." }),
          secondary: color("#0f0"),
        },
      },
    });

    const result = applyStagedDiffs(baseJson, figmaJson, new Set(["Tokens.brand.secondary"]));

    expect(JSON.parse(result).Tokens.brand.primary).toEqual(
      color("#fff", { $description: "The brand primary color." })
    );
  });

  it("mirrors Figma's current root $modes even when no token paths are staged", () => {
    const baseJson = JSON.stringify({ $modes: { Light: {} }, Tokens: {} });
    const figmaJson = JSON.stringify({ $modes: { Light: {}, Dark: { $fallback: "Light" } }, Tokens: {} });

    const result = applyStagedDiffs(baseJson, figmaJson, new Set());

    expect(JSON.parse(result).$modes).toEqual({ Light: {}, Dark: { $fallback: "Light" } });
  });

  it("mirrors a collection's $extensions (e.g. hiddenFromPublishing) independent of staged token paths", () => {
    const baseJson = JSON.stringify({
      Tokens: { brand: { primary: color("#fff") } },
    });
    const figmaJson = JSON.stringify({
      Tokens: {
        $extensions: { figma: { hiddenFromPublishing: true } },
        brand: { primary: color("#fff") },
      },
    });

    const result = applyStagedDiffs(baseJson, figmaJson, new Set());

    expect(JSON.parse(result).Tokens.$extensions).toEqual({ figma: { hiddenFromPublishing: true } });
  });

  it("reproduces a from-scratch export exactly for a brand-new repo, including $modes and collection metadata", () => {
    const figmaTree = {
      $modes: { Light: {}, Dark: { $fallback: "Light" } },
      Tokens: {
        $extensions: { figma: { hiddenFromPublishing: true } },
        brand: { primary: color("#fff") },
      },
    };
    const figmaJson = JSON.stringify(figmaTree);

    const result = applyStagedDiffs("{}", figmaJson, new Set(["Tokens.brand.primary"]));

    expect(JSON.parse(result)).toEqual(figmaTree);
  });

  it("reproduces the intended merge end-to-end when staged paths come from computeDiff's own output", () => {
    const gitJson = JSON.stringify({
      Tokens: {
        brand: {
          primary: color("#fff"),
          secondary: color("#f00"),
          tertiary: color("#00f"),
        },
      },
      // An invalid/quarantined subtree (both $value and a non-"$" child) — excluded from
      // diffs entirely (Bug 1), so it must survive the merge byte-for-byte, untouched.
      Notes: { readme: { $value: "hand-authored, not from Figma", weird: {} } },
    });
    const figmaJson = JSON.stringify({
      Tokens: {
        brand: {
          primary: color("#000"), // modified
          secondary: color("#f00"), // unchanged
          quaternary: color("#ff0"), // added
          // tertiary removed
        },
      },
    });

    const { diffs } = computeDiff(figmaJson, gitJson, "proposals");
    const stagedDotPaths = new Set(diffs.map((d) => d.dotPath));

    const result = applyStagedDiffs(gitJson, figmaJson, stagedDotPaths);

    expect(JSON.parse(result)).toEqual({
      Tokens: {
        brand: {
          primary: color("#000"),
          secondary: color("#f00"),
          quaternary: color("#ff0"),
        },
      },
      Notes: { readme: { $value: "hand-authored, not from Figma", weird: {} } },
    });
  });
});
