import { describe, it, expect } from "vitest";
import { computeDiff } from "./diff";

describe("computeDiff", () => {
  const tokenA = JSON.stringify({
    Tokens: {
      brand: {
        primary: {
          "$type": "color",
          "$value": "#ffffff"
        }
      }
    }
  });

  const tokenB = JSON.stringify({
    Tokens: {
      brand: {
        primary: {
          "$type": "color",
          "$value": "#000000"
        }
      }
    }
  });

  const tokenMultiA = JSON.stringify({
    "$modes": { "Light": {}, "Dark": {} },
    Tokens: {
      brand: {
        primary: {
          "$type": "color",
          "$value": "#ffffff",
          "$modes": { "Dark": "#000000" }
        }
      }
    }
  });

  const tokenMultiB = JSON.stringify({
    "$modes": { "Light": {}, "Dark": {} },
    Tokens: {
      brand: {
        primary: {
          "$type": "color",
          "$value": "#ffffff",
          "$modes": { "Dark": "#111111" }
        }
      }
    }
  });

  describe("Matching Tokens", () => {
    it("should return empty diff when figma and git tokens match", () => {
      const diffProposals = computeDiff(tokenA, tokenA, "proposals");
      const diffUpdates = computeDiff(tokenA, tokenA, "updates");

      expect(diffProposals.diffs).toEqual([]);
      expect(diffUpdates.diffs).toEqual([]);
    });
  });

  describe("Modified Tokens", () => {
    it("should detect modified values in proposals mode", () => {
      // Figma has B (new value #000000), Git has A (old value #ffffff)
      const { diffs } = computeDiff(tokenB, tokenA, "proposals");
      expect(diffs).toHaveLength(1);
      expect(diffs[0]).toEqual({
        path: ["Tokens", "brand", "primary"],
        dotPath: "Tokens.brand.primary",
        type: "modified",
        figmaVal: "#000000",
        gitVal: "#ffffff",
      });
    });

    it("should detect modified values in updates mode", () => {
      // Figma has A (old value #ffffff), Git has B (new value #000000)
      const { diffs } = computeDiff(tokenA, tokenB, "updates");
      expect(diffs).toHaveLength(1);
      expect(diffs[0]).toEqual({
        path: ["Tokens", "brand", "primary"],
        dotPath: "Tokens.brand.primary",
        type: "modified",
        figmaVal: "#ffffff",
        gitVal: "#000000",
      });
    });
  });

  describe("Added & Deleted Tokens", () => {
    const tokenWithTwo = JSON.stringify({
      Tokens: {
        brand: {
          primary: { "$type": "color", "$value": "#ffffff" },
          secondary: { "$type": "color", "$value": "#ff0000" }
        }
      }
    });

    it("should detect additions in proposals mode", () => {
      // Figma has two tokens, Git has only one. secondary is added.
      const { diffs } = computeDiff(tokenWithTwo, tokenA, "proposals");
      expect(diffs).toHaveLength(1);
      expect(diffs[0]).toEqual({
        path: ["Tokens", "brand", "secondary"],
        dotPath: "Tokens.brand.secondary",
        type: "added",
        figmaVal: "#ff0000",
        gitVal: "",
      });
    });

    it("should detect deletions in proposals mode", () => {
      // Figma has only primary, Git has both. secondary is deleted in Figma.
      const { diffs } = computeDiff(tokenA, tokenWithTwo, "proposals");
      expect(diffs).toHaveLength(1);
      expect(diffs[0]).toEqual({
        path: ["Tokens", "brand", "secondary"],
        dotPath: "Tokens.brand.secondary",
        type: "deleted",
        figmaVal: "",
        gitVal: "#ff0000",
      });
    });

    it("should detect additions in updates mode", () => {
      // Figma has one token, Git has both. secondary is added in Git.
      const { diffs } = computeDiff(tokenA, tokenWithTwo, "updates");
      expect(diffs).toHaveLength(1);
      expect(diffs[0]).toEqual({
        path: ["Tokens", "brand", "secondary"],
        dotPath: "Tokens.brand.secondary",
        type: "added",
        figmaVal: "",
        gitVal: "#ff0000",
      });
    });

    it("should detect deletions in updates mode", () => {
      // Figma has both, Git has only one. secondary is deleted in Git.
      const { diffs } = computeDiff(tokenWithTwo, tokenA, "updates");
      expect(diffs).toHaveLength(1);
      expect(diffs[0]).toEqual({
        path: ["Tokens", "brand", "secondary"],
        dotPath: "Tokens.brand.secondary",
        type: "deleted",
        figmaVal: "#ff0000",
        gitVal: "",
      });
    });
  });

  describe("Multi-mode Tokens", () => {
    it("should detect mode value differences", () => {
      const { diffs } = computeDiff(tokenMultiB, tokenMultiA, "proposals");
      expect(diffs).toHaveLength(1);
      expect(diffs[0]).toEqual({
        path: ["Tokens", "brand", "primary"],
        dotPath: "Tokens.brand.primary",
        type: "modified",
        figmaVal: "#ffffff (Dark: #111111)",
        gitVal: "#ffffff (Dark: #000000)",
      });
    });
  });

  describe("Empty/404 Git JSON Scenario", () => {
    it("should mark everything as deleted in updates mode if git is empty", () => {
      const { diffs } = computeDiff(tokenA, "{}", "updates");
      expect(diffs).toHaveLength(1);
      expect(diffs[0]).toEqual({
        path: ["Tokens", "brand", "primary"],
        dotPath: "Tokens.brand.primary",
        type: "deleted",
        figmaVal: "#ffffff",
        gitVal: "",
      });
    });

    it("should mark everything as added in proposals mode if git is empty", () => {
      const { diffs } = computeDiff(tokenA, "{}", "proposals");
      expect(diffs).toHaveLength(1);
      expect(diffs[0]).toEqual({
        path: ["Tokens", "brand", "primary"],
        dotPath: "Tokens.brand.primary",
        type: "added",
        figmaVal: "#ffffff",
        gitVal: "",
      });
    });
  });

  describe("Metadata-only changes", () => {
    const withDescriptionA = JSON.stringify({
      Tokens: {
        brand: {
          primary: { "$type": "color", "$value": "#ffffff", "$description": "Old guidance" },
        },
      },
    });

    const withDescriptionB = JSON.stringify({
      Tokens: {
        brand: {
          primary: { "$type": "color", "$value": "#ffffff", "$description": "New guidance" },
        },
      },
    });

    it("should detect a description-only change as modified, with changedFields describing it", () => {
      // Figma has the new description (B), Git still has the old one (A).
      const { diffs } = computeDiff(withDescriptionB, withDescriptionA, "proposals");
      expect(diffs).toHaveLength(1);
      expect(diffs[0]).toEqual({
        path: ["Tokens", "brand", "primary"],
        dotPath: "Tokens.brand.primary",
        type: "modified",
        figmaVal: "#ffffff",
        gitVal: "#ffffff",
        changedFields: [{ field: "description", figmaVal: "New guidance", gitVal: "Old guidance" }],
      });
    });

    it("should detect a scopes-only change", () => {
      const withScopesA = JSON.stringify({
        Tokens: {
          brand: {
            primary: {
              "$type": "color", "$value": "#ffffff",
              "$extensions": { figma: { scopes: ["FRAME_FILL"] } },
            },
          },
        },
      });
      const withScopesB = JSON.stringify({
        Tokens: {
          brand: {
            primary: {
              "$type": "color", "$value": "#ffffff",
              "$extensions": { figma: { scopes: ["FRAME_FILL", "SHAPE_FILL"] } },
            },
          },
        },
      });

      const { diffs } = computeDiff(withScopesB, withScopesA, "proposals");
      expect(diffs).toHaveLength(1);
      expect(diffs[0].changedFields).toEqual([
        { field: "scopes", figmaVal: "FRAME_FILL, SHAPE_FILL", gitVal: "FRAME_FILL" },
      ]);
    });

    it("should not report a scopes change when the same scopes differ only in order", () => {
      const scopesOrderA = JSON.stringify({
        Tokens: {
          brand: {
            primary: {
              "$type": "color", "$value": "#ffffff",
              "$extensions": { figma: { scopes: ["FRAME_FILL", "SHAPE_FILL"] } },
            },
          },
        },
      });
      const scopesOrderB = JSON.stringify({
        Tokens: {
          brand: {
            primary: {
              "$type": "color", "$value": "#ffffff",
              "$extensions": { figma: { scopes: ["SHAPE_FILL", "FRAME_FILL"] } },
            },
          },
        },
      });

      const { diffs } = computeDiff(scopesOrderB, scopesOrderA, "proposals");
      expect(diffs).toEqual([]);
    });

    it("should detect a codeSyntax-only change", () => {
      const withCodeSyntaxA = JSON.stringify({
        Tokens: {
          brand: {
            primary: {
              "$type": "color", "$value": "#ffffff",
              "$extensions": { figma: { codeSyntax: { WEB: "var(--old)" } } },
            },
          },
        },
      });
      const withCodeSyntaxB = JSON.stringify({
        Tokens: {
          brand: {
            primary: {
              "$type": "color", "$value": "#ffffff",
              "$extensions": { figma: { codeSyntax: { WEB: "var(--new)" } } },
            },
          },
        },
      });

      const { diffs } = computeDiff(withCodeSyntaxB, withCodeSyntaxA, "proposals");
      expect(diffs).toHaveLength(1);
      expect(diffs[0].changedFields).toEqual([
        { field: "codeSyntax", figmaVal: '{"WEB":"var(--new)"}', gitVal: '{"WEB":"var(--old)"}' },
      ]);
    });

    it("should not report a codeSyntax change when the same platforms differ only in key order", () => {
      const codeSyntaxOrderA = JSON.stringify({
        Tokens: {
          brand: {
            primary: {
              "$type": "color", "$value": "#ffffff",
              "$extensions": { figma: { codeSyntax: { WEB: "var(--x)", ANDROID: "x" } } },
            },
          },
        },
      });
      const codeSyntaxOrderB = JSON.stringify({
        Tokens: {
          brand: {
            primary: {
              "$type": "color", "$value": "#ffffff",
              "$extensions": { figma: { codeSyntax: { ANDROID: "x", WEB: "var(--x)" } } },
            },
          },
        },
      });

      const { diffs } = computeDiff(codeSyntaxOrderB, codeSyntaxOrderA, "proposals");
      expect(diffs).toEqual([]);
    });

    it("should detect a hiddenFromPublishing-only change", () => {
      const withHiddenA = JSON.stringify({
        Tokens: {
          brand: {
            primary: {
              "$type": "color", "$value": "#ffffff",
              "$extensions": { figma: { hiddenFromPublishing: false } },
            },
          },
        },
      });
      const withHiddenB = JSON.stringify({
        Tokens: {
          brand: {
            primary: {
              "$type": "color", "$value": "#ffffff",
              "$extensions": { figma: { hiddenFromPublishing: true } },
            },
          },
        },
      });

      const { diffs } = computeDiff(withHiddenB, withHiddenA, "proposals");
      expect(diffs).toHaveLength(1);
      expect(diffs[0].changedFields).toEqual([
        { field: "hiddenFromPublishing", figmaVal: "true", gitVal: "false" },
      ]);
    });

    it("should flag a type-only change distinctly via changedFields", () => {
      const asColor = JSON.stringify({
        Tokens: { sizes: { width: { "$type": "color", "$value": "#ffffff" } } },
      });
      const asDimension = JSON.stringify({
        Tokens: { sizes: { width: { "$type": "dimension", "$value": "#ffffff" } } },
      });

      const { diffs } = computeDiff(asDimension, asColor, "proposals");
      expect(diffs).toHaveLength(1);
      expect(diffs[0].changedFields).toEqual([
        { field: "type", figmaVal: "dimension", gitVal: "color" },
      ]);
    });

    it("should report both a value change and a description change without duplicating the value into changedFields", () => {
      const before = JSON.stringify({
        Tokens: {
          brand: {
            primary: { "$type": "color", "$value": "#ffffff", "$description": "Old guidance" },
          },
        },
      });
      const after = JSON.stringify({
        Tokens: {
          brand: {
            primary: { "$type": "color", "$value": "#000000", "$description": "New guidance" },
          },
        },
      });

      const { diffs } = computeDiff(after, before, "proposals");
      expect(diffs).toHaveLength(1);
      expect(diffs[0]).toEqual({
        path: ["Tokens", "brand", "primary"],
        dotPath: "Tokens.brand.primary",
        type: "modified",
        figmaVal: "#000000",
        gitVal: "#ffffff",
        changedFields: [{ field: "description", figmaVal: "New guidance", gitVal: "Old guidance" }],
      });
    });
  });

  describe("Quarantined collisions", () => {
    const figmaWithTwo = JSON.stringify({
      Tokens: {
        brand: {
          primary: { "$type": "color", "$value": "#ffffff" },
          secondary: { "$type": "color", "$value": "#ff0000" }
        }
      }
    });

    // "secondary" is quarantined on the git side: it's both a token ($value)
    // and a group (has a "Hover" child) — invalid DTCG, per findTokens.ts.
    const gitWithCollision = JSON.stringify({
      Tokens: {
        brand: {
          primary: { "$type": "color", "$value": "#ffffff" },
          secondary: {
            "$type": "color",
            "$value": "#ff0000",
            Hover: { "$type": "color", "$value": "#cc0000" }
          }
        }
      }
    });

    it("should exclude a git-side collision from the diff instead of showing it as added/deleted, and report it separately", () => {
      // Figma has a clean "secondary" token; Git's "secondary" is quarantined.
      // Without quarantine-awareness this would misleadingly show as "added" (proposals)
      // or "deleted" (updates), since it's simply absent from Git's parsed token map.
      const proposalsResult = computeDiff(figmaWithTwo, gitWithCollision, "proposals");
      const updatesResult = computeDiff(figmaWithTwo, gitWithCollision, "updates");

      expect(proposalsResult.diffs).toEqual([]);
      expect(updatesResult.diffs).toEqual([]);
      expect(proposalsResult.quarantined).toEqual(["Tokens.brand.secondary"]);
      expect(updatesResult.quarantined).toEqual(["Tokens.brand.secondary"]);
    });
  });
});
