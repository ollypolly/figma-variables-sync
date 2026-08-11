import { describe, it, expect } from "vitest";
import { findTokens } from "./findTokens";

describe("findTokens", () => {
  it("quarantines a node that has both $value and child tokens, instead of dropping the children", () => {
    const dtcg = {
      Primary: {
        $type: "color",
        $value: "#ffffff",
        Hover: {
          $type: "color",
          $value: "#eeeeee",
        },
      },
    };

    const result = findTokens(dtcg);

    expect(result.quarantined).toEqual(["Primary"]);
    expect(result.tokens).toEqual([]);
  });

  it("reads $description onto the parsed token", () => {
    const dtcg = {
      Primary: {
        $type: "color",
        $value: "#ffffff",
        $description: "The Goodlord teal. Use for primary button backgrounds.",
      },
    };

    const result = findTokens(dtcg);

    expect(result.tokens[0].description).toBe(
      "The Goodlord teal. Use for primary button backgrounds."
    );
  });

  it("leaves description undefined when $description is absent", () => {
    const dtcg = { Primary: { $type: "color", $value: "#ffffff" } };

    const result = findTokens(dtcg);

    expect(result.tokens[0].description).toBeUndefined();
  });

  it("reads $extensions.figma.scopes onto the parsed token", () => {
    const dtcg = {
      Primary: {
        $type: "color",
        $value: "#ffffff",
        $extensions: { figma: { scopes: ["FRAME_FILL", "SHAPE_FILL"] } },
      },
    };

    const result = findTokens(dtcg);

    expect(result.tokens[0].figmaScopes).toEqual(["FRAME_FILL", "SHAPE_FILL"]);
  });

  it("leaves figmaScopes undefined when $extensions.figma.scopes is absent", () => {
    const dtcg = { Primary: { $type: "color", $value: "#ffffff" } };

    const result = findTokens(dtcg);

    expect(result.tokens[0].figmaScopes).toBeUndefined();
  });

  it("reads $extensions.figma.codeSyntax onto the parsed token", () => {
    const dtcg = {
      Primary: {
        $type: "color",
        $value: "#ffffff",
        $extensions: {
          figma: { codeSyntax: { WEB: "var(--colors-primary)", ANDROID: "colorsPrimary" } },
        },
      },
    };

    const result = findTokens(dtcg);

    expect(result.tokens[0].figmaCodeSyntax).toEqual({
      WEB: "var(--colors-primary)",
      ANDROID: "colorsPrimary",
    });
  });

  it("reads $extensions.figma.hiddenFromPublishing onto the parsed token", () => {
    const dtcg = {
      Primary: {
        $type: "color",
        $value: "#ffffff",
        $extensions: { figma: { hiddenFromPublishing: true } },
      },
    };

    const result = findTokens(dtcg);

    expect(result.tokens[0].figmaHiddenFromPublishing).toBe(true);
  });
});
