import { describe, it, expect } from "vitest";
import { importFromDtcg } from "./importFromDtcg";
import { createMockFigma } from "@common/testUtils/mockFigma";
import { color, dimension } from "@common/testUtils/tokens";

describe("importFromDtcg", () => {
  it("should parse DTCG JSON format and build native Figma collections, modes, variables, and links", async () => {
    const { figmaMock } = createMockFigma();

    const dtcgJson = {
      "$modes": {
        "Light": {},
        "Dark": { "$fallback": "Light" }
      },
      "Tokens": {
        "colors": {
          "primary": color("#ffffff", { "$modes": { "Dark": "#000000" } }),
          "surface": color("{Tokens.colors.primary}", {
            "$modes": { "Dark": "{Tokens.colors.primary}" },
          }),
        },
        "sizes": {
          "width": {
            "$type": "number",
            "$value": 16,
            "$modes": {
              "Dark": 24
            }
          }
        }
      }
    };

    await importFromDtcg(JSON.stringify(dtcgJson), figmaMock);

    const collections = figmaMock.variables.getLocalVariableCollections();
    const variables = figmaMock.variables.getLocalVariables();

    // Verify collection & modes created
    expect(collections.length).toBe(1);
    expect(collections[0].name).toBe("Tokens");
    expect(collections[0].modes.map((m: any) => m.name)).toEqual(["Light", "Dark"]);

    // Verify variables created
    expect(variables.length).toBe(3);

    const primaryVar = variables.find((v: any) => v.name === "colors/primary");
    const surfaceVar = variables.find((v: any) => v.name === "colors/surface");
    const widthVar = variables.find((v: any) => v.name === "sizes/width");

    expect(primaryVar).toBeDefined();
    expect(surfaceVar).toBeDefined();
    expect(widthVar).toBeDefined();

    const modeIds = collections[0].modes.map((m: any) => m.modeId);

    // Verify color conversion
    expect(primaryVar.resolvedType).toBe("COLOR");
    expect(primaryVar.valuesByMode[modeIds[0]]).toEqual({ r: 1, g: 1, b: 1, a: 1 });
    expect(primaryVar.valuesByMode[modeIds[1]]).toEqual({ r: 0, g: 0, b: 0, a: 1 });

    // Verify alias linking
    expect(surfaceVar.resolvedType).toBe("COLOR");
    expect(surfaceVar.valuesByMode[modeIds[0]]).toEqual({ type: "VARIABLE_ALIAS", id: primaryVar.id });
    expect(surfaceVar.valuesByMode[modeIds[1]]).toEqual({ type: "VARIABLE_ALIAS", id: primaryVar.id });

    // Verify dimension/number parsing
    expect(widthVar.resolvedType).toBe("FLOAT");
    expect(widthVar.valuesByMode[modeIds[0]]).toBe(16);
    expect(widthVar.valuesByMode[modeIds[1]]).toBe(24);
  });

  it("should handle Figma Starter plan limits gracefully by falling back to a single mode if addMode throws", async () => {
    const { figmaMock } = createMockFigma();
    
    let notifiedMsg = "";
    figmaMock.notify = (msg: string) => {
      notifiedMsg = msg;
    };

    const originalCreateCollection = figmaMock.variables.createVariableCollection;
    figmaMock.variables.createVariableCollection = (name: string) => {
      const col = originalCreateCollection.call(figmaMock.variables, name);
      col.addMode = () => {
        throw new Error("addMode: Limited to 1 modes only");
      };
      return col;
    };

    const dtcgJson = {
      "$modes": {
        "Light": {},
        "Dark": { "$fallback": "Light" }
      },
      "Tokens": {
        "colors": {
          "primary": color("#ffffff", { "$modes": { "Dark": "#000000" } }),
        },
      },
    };

    await importFromDtcg(JSON.stringify(dtcgJson), figmaMock);

    const collections = figmaMock.variables.getLocalVariableCollections();
    const variables = figmaMock.variables.getLocalVariables();

    expect(collections.length).toBe(1);
    expect(collections[0].modes.map((m: any) => m.name)).toEqual(["Light"]);

    expect(variables.length).toBe(1);
    const primaryVar = variables[0];
    expect(primaryVar.name).toBe("colors/primary");

    const modeId = collections[0].modes[0].modeId;
    expect(primaryVar.valuesByMode[modeId]).toEqual({ r: 1, g: 1, b: 1, a: 1 });

    expect(notifiedMsg).toContain("Figma plan limit: Only the default mode was imported");
  });

  it("quarantines a colliding subtree instead of silently losing it, and still imports the clean tokens", async () => {
    const { figmaMock } = createMockFigma();

    const dtcgJson = {
      Tokens: {
        colors: {
          Primary: { ...color("#ffffff"), Hover: color("#eeeeee") },
          secondary: color("#000000"),
        },
      },
    };

    const result = await importFromDtcg(JSON.stringify(dtcgJson), figmaMock);

    expect(result.quarantined).toEqual(["Tokens.colors.Primary"]);

    const variables = figmaMock.variables.getLocalVariables();
    expect(variables.length).toBe(1);
    expect(variables[0].name).toBe("colors/secondary");
  });

  it("flags a token with a dangling alias reference via unresolvedAliases, while still importing it with the fallback color", async () => {
    const { figmaMock } = createMockFigma();

    const dtcgJson = {
      Tokens: {
        colors: {
          primary: color("#ffffff"),
          warning: color("{Semantic.Colours.Status.Warning}"),
        },
      },
    };

    const result = await importFromDtcg(JSON.stringify(dtcgJson), figmaMock);

    expect(result.unresolvedAliases).toEqual(["Tokens.colors.warning"]);
    expect(result.quarantined).toEqual([]);

    const variables = figmaMock.variables.getLocalVariables();
    expect(variables.map((v: any) => v.name).sort()).toEqual(["colors/primary", "colors/warning"]);

    const warningVar = variables.find((v: any) => v.name === "colors/warning");
    const modeId = figmaMock.variables.getLocalVariableCollections()[0].modes[0].modeId;
    expect(warningVar.valuesByMode[modeId]).toEqual({ r: 0, g: 0, b: 0, a: 1 });
  });

  it("sets a variable's description from $description", async () => {
    const { figmaMock } = createMockFigma();

    const dtcgJson = {
      Tokens: {
        colors: {
          primary: color("#ffffff", {
            $description: "The Goodlord teal. Use for primary button backgrounds.",
          }),
        },
      },
    };

    await importFromDtcg(JSON.stringify(dtcgJson), figmaMock);

    const primaryVar = figmaMock.variables.getLocalVariables()[0];
    expect(primaryVar.description).toBe(
      "The Goodlord teal. Use for primary button backgrounds."
    );
  });

  it("sets a variable's scopes from $extensions.figma.scopes", async () => {
    const { figmaMock } = createMockFigma();

    const dtcgJson = {
      Tokens: {
        colors: {
          primary: color("#ffffff", {
            $extensions: { figma: { scopes: ["FRAME_FILL", "SHAPE_FILL"] } },
          }),
        },
      },
    };

    await importFromDtcg(JSON.stringify(dtcgJson), figmaMock);

    const primaryVar = figmaMock.variables.getLocalVariables()[0];
    expect(primaryVar.scopes).toEqual(["FRAME_FILL", "SHAPE_FILL"]);
  });

  it("falls back to the WIDTH_HEIGHT scope for a new dimension variable with no $extensions.figma.scopes", async () => {
    const { figmaMock } = createMockFigma();

    const dtcgJson = {
      Tokens: {
        sizes: {
          width: dimension("16px"),
        },
      },
    };

    await importFromDtcg(JSON.stringify(dtcgJson), figmaMock);

    const widthVar = figmaMock.variables.getLocalVariables()[0];
    expect(widthVar.scopes).toEqual(["WIDTH_HEIGHT"]);
  });

  it("applies an explicit empty scopes array instead of leaving the variable untouched", async () => {
    const { figmaMock } = createMockFigma();
    const col = figmaMock.variables.createVariableCollection("Tokens");
    const existing = figmaMock.variables.createVariable("colors/hidden", col.id, "COLOR");
    existing.scopes = ["ALL_SCOPES"];

    const dtcgJson = {
      Tokens: {
        colors: {
          hidden: color("#ffffff", { "$extensions": { figma: { scopes: [] } } }),
        },
      },
    };

    await importFromDtcg(JSON.stringify(dtcgJson), figmaMock);

    expect(existing.scopes).toEqual([]);
  });

  it("resets scopes to ALL_SCOPES when git no longer specifies any, rather than leaving the old value", async () => {
    const { figmaMock } = createMockFigma();
    const col = figmaMock.variables.createVariableCollection("Tokens");
    const existing = figmaMock.variables.createVariable("colors/primary", col.id, "COLOR");
    existing.scopes = ["FRAME_FILL"];

    const dtcgJson = {
      Tokens: {
        colors: {
          primary: color("#ffffff"),
        },
      },
    };

    await importFromDtcg(JSON.stringify(dtcgJson), figmaMock);

    expect(existing.scopes).toEqual(["ALL_SCOPES"]);
  });

  it("sets a variable's codeSyntax from $extensions.figma.codeSyntax", async () => {
    const { figmaMock } = createMockFigma();

    const dtcgJson = {
      Tokens: {
        colors: {
          primary: color("#ffffff", {
            $extensions: {
              figma: { codeSyntax: { WEB: "var(--colors-primary)", ANDROID: "colorsPrimary" } },
            },
          }),
        },
      },
    };

    await importFromDtcg(JSON.stringify(dtcgJson), figmaMock);

    const primaryVar = figmaMock.variables.getLocalVariables()[0];
    expect(primaryVar.codeSyntax).toEqual({
      WEB: "var(--colors-primary)",
      ANDROID: "colorsPrimary",
    });
  });

  it("removes a previously-set codeSyntax platform that's no longer present in the DTCG", async () => {
    const { figmaMock } = createMockFigma();

    const withCodeSyntax = {
      Tokens: {
        colors: {
          primary: color("#ffffff", {
            $extensions: { figma: { codeSyntax: { WEB: "var(--colors-primary)" } } },
          }),
        },
      },
    };
    await importFromDtcg(JSON.stringify(withCodeSyntax), figmaMock);

    const withoutCodeSyntax = {
      Tokens: {
        colors: {
          primary: color("#ffffff"),
        },
      },
    };
    await importFromDtcg(JSON.stringify(withoutCodeSyntax), figmaMock);

    const primaryVar = figmaMock.variables.getLocalVariables()[0];
    expect(primaryVar.codeSyntax).toEqual({});
  });

  it("sets hiddenFromPublishing from $extensions.figma.hiddenFromPublishing", async () => {
    const { figmaMock } = createMockFigma();

    const dtcgJson = {
      Tokens: {
        colors: {
          primary: color("#ffffff", {
            $extensions: { figma: { hiddenFromPublishing: true } },
          }),
        },
      },
    };

    await importFromDtcg(JSON.stringify(dtcgJson), figmaMock);

    const primaryVar = figmaMock.variables.getLocalVariables()[0];
    expect(primaryVar.hiddenFromPublishing).toBe(true);
  });

  it("removes a Figma variable whose token was removed from a later import, leaving its sibling untouched", async () => {
    const { figmaMock } = createMockFigma();

    const withBothTokens = {
      Tokens: {
        colors: {
          primary: color("#ffffff"),
          secondary: color("#000000"),
        },
      },
    };
    await importFromDtcg(JSON.stringify(withBothTokens), figmaMock);

    const withPrimaryOnly = {
      Tokens: {
        colors: {
          primary: color("#ffffff"),
        },
      },
    };
    const result = await importFromDtcg(JSON.stringify(withPrimaryOnly), figmaMock);

    const variables = figmaMock.variables.getLocalVariables();
    expect(variables.length).toBe(1);
    expect(variables[0].name).toBe("colors/primary");
    expect(result.removed).toEqual(["Tokens.colors.secondary"]);
  });

  it("removes a whole collection and its variables when the collection is removed from a later import", async () => {
    const { figmaMock } = createMockFigma();

    const withBothCollections = {
      Tokens: {
        colors: { primary: color("#ffffff") },
      },
      Spacing: {
        sizes: { sm: dimension("4px") },
      },
    };
    await importFromDtcg(JSON.stringify(withBothCollections), figmaMock);

    const withoutSpacing = {
      Tokens: {
        colors: { primary: color("#ffffff") },
      },
    };
    await importFromDtcg(JSON.stringify(withoutSpacing), figmaMock);

    const collections = figmaMock.variables.getLocalVariableCollections();
    expect(collections.map((c: any) => c.name)).toEqual(["Tokens"]);

    const variables = figmaMock.variables.getLocalVariables();
    expect(variables.length).toBe(1);
    expect(variables[0].name).toBe("colors/primary");
  });

  it("re-importing identical DTCG JSON deletes nothing", async () => {
    const { figmaMock } = createMockFigma();

    const dtcgJson = {
      Tokens: {
        colors: {
          primary: color("#ffffff"),
          secondary: color("#000000"),
        },
      },
    };
    await importFromDtcg(JSON.stringify(dtcgJson), figmaMock);
    await importFromDtcg(JSON.stringify(dtcgJson), figmaMock);

    expect(figmaMock.variables.getLocalVariableCollections().length).toBe(1);
    expect(figmaMock.variables.getLocalVariables().length).toBe(2);
  });

  it("still recreates a variable whose $type changed, without the orphan-cleanup pass also touching it", async () => {
    const { figmaMock } = createMockFigma();

    const asColor = {
      Tokens: { primary: color("#ffffff") },
    };
    await importFromDtcg(JSON.stringify(asColor), figmaMock);
    const originalId = figmaMock.variables.getLocalVariables()[0].id;

    const asDimension = {
      Tokens: { primary: dimension("16px") },
    };
    await importFromDtcg(JSON.stringify(asDimension), figmaMock);

    const variables = figmaMock.variables.getLocalVariables();
    expect(variables.length).toBe(1);
    expect(variables[0].resolvedType).toBe("FLOAT");
    expect(variables[0].id).not.toBe(originalId);
  });

  it("does not delete a variable whose token became quarantined in a later import, even with valid siblings present", async () => {
    const { figmaMock } = createMockFigma();

    const clean = {
      Tokens: {
        colors: {
          Primary: color("#ffffff"),
          secondary: color("#000000"),
        },
      },
    };
    await importFromDtcg(JSON.stringify(clean), figmaMock);
    expect(figmaMock.variables.getLocalVariables().length).toBe(2);

    // "Primary" becomes structurally ambiguous (both $value and a non-"$" child) —
    // quarantined by parseDtcg, so it's absent from `tokens`, not proof it was removed.
    // "secondary" stays valid, so the collection itself is very much still present in Git.
    const nowQuarantined = {
      Tokens: {
        colors: {
          Primary: { ...color("#ffffff"), Hover: color("#eeeeee") },
          secondary: color("#000000"),
        },
      },
    };
    const result = await importFromDtcg(JSON.stringify(nowQuarantined), figmaMock);

    expect(result.quarantined).toEqual(["Tokens.colors.Primary"]);
    const variables = figmaMock.variables.getLocalVariables();
    expect(variables.map((v: any) => v.name).sort()).toEqual(["colors/Primary", "colors/secondary"]);
  });

  it("does nothing, including no deletions, when a later import has zero parseable tokens", async () => {
    const { figmaMock } = createMockFigma();

    const withTokens = {
      Tokens: { primary: color("#ffffff") },
    };
    await importFromDtcg(JSON.stringify(withTokens), figmaMock);
    expect(figmaMock.variables.getLocalVariables().length).toBe(1);

    // Wholly ambiguous — quarantined, so `tokens` ends up empty. Not proof of an
    // intentional wipe, so this must be a no-op rather than deleting everything.
    const whollyQuarantined = {
      Tokens: {
        primary: { ...color("#ffffff"), weird: {} },
      },
    };
    await importFromDtcg(JSON.stringify(whollyQuarantined), figmaMock);

    expect(figmaMock.variables.getLocalVariableCollections().length).toBe(1);
    expect(figmaMock.variables.getLocalVariables().length).toBe(1);
  });

  it("does not alias a surviving token to a variable that PASS 0 just removed in the same import", async () => {
    const { figmaMock } = createMockFigma();

    const withBoth = {
      Tokens: {
        colors: {
          primary: color("#ffffff"),
          link: color("{Tokens.colors.primary}"),
        },
      },
    };
    await importFromDtcg(JSON.stringify(withBoth), figmaMock);

    // "primary" is gone from this import (removed by PASS 0), but "link" still
    // carries a dangling alias to it — a stale pathToVariableIdMap entry pointing
    // at the now-deleted variable's id would incorrectly resolve this alias.
    const primaryRemoved = {
      Tokens: {
        colors: {
          link: color("{Tokens.colors.primary}"),
        },
      },
    };
    const result = await importFromDtcg(JSON.stringify(primaryRemoved), figmaMock);

    expect(result.removed).toEqual(["Tokens.colors.primary"]);
    expect(result.unresolvedAliases).toEqual(["Tokens.colors.link"]);

    const variables = figmaMock.variables.getLocalVariables();
    expect(variables).toHaveLength(1);
    const linkVar = variables[0];
    expect(linkVar.name).toBe("colors/link");

    const modeId = figmaMock.variables.getLocalVariableCollections()[0].modes[0].modeId;
    // Should fall through to the color-parsing fallback (unresolved alias), not an
    // alias pointing at "primary"'s now-deleted id.
    expect(linkVar.valuesByMode[modeId]).toEqual({ r: 0, g: 0, b: 0, a: 1 });
  });

  it("sets a collection's hiddenFromPublishing from the collection's own $extensions.figma", async () => {
    const { figmaMock } = createMockFigma();

    const dtcgJson = {
      Tokens: {
        $extensions: { figma: { hiddenFromPublishing: true } },
        colors: {
          primary: color("#ffffff"),
        },
      },
    };

    await importFromDtcg(JSON.stringify(dtcgJson), figmaMock);

    const collection = figmaMock.variables.getLocalVariableCollections()[0];
    expect(collection.hiddenFromPublishing).toBe(true);
  });
});
