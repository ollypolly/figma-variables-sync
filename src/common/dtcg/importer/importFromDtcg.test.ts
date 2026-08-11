import { describe, it, expect } from "vitest";
import { importFromDtcg } from "./importFromDtcg";

function createMockFigma() {
  const collections: any[] = [];
  const variables: any[] = [];

  const figmaMock: any = {
    variables: {
      getLocalVariableCollections() {
        return collections;
      },
      getLocalVariables() {
        return variables;
      },
      getVariableCollectionById(id: string) {
        return collections.find(c => c.id === id) || null;
      },
      getVariableById(id: string) {
        return variables.find(v => v.id === id) || null;
      },
      createVariableCollection(name: string) {
        const id = `col-${collections.length + 1}`;
        const newCol = {
          id,
          name,
          modes: [{ modeId: `${id}-mode-1`, name: "Mode 1" }],
          hiddenFromPublishing: false,
          renameMode(modeId: string, name: string) {
            const m = this.modes.find((mode: any) => mode.modeId === modeId);
            if (m) m.name = name;
          },
          addMode(name: string) {
            const modeId = `${id}-mode-${this.modes.length + 1}`;
            this.modes.push({ modeId, name });
            return modeId;
          }
        };
        collections.push(newCol);
        return newCol;
      },
      createVariable(name: string, collectionId: string, resolvedType: string) {
        const id = `var-${variables.length + 1}`;
        const newVar = {
          id,
          name,
          variableCollectionId: collectionId,
          resolvedType,
          valuesByMode: {} as Record<string, any>,
          description: "",
          scopes: [] as string[],
          codeSyntax: {} as Record<string, string>,
          hiddenFromPublishing: false,
          setValueForMode(modeId: string, value: any) {
             this.valuesByMode[modeId] = value;
          },
          setVariableCodeSyntax(platform: string, value: string) {
            this.codeSyntax[platform] = value;
          },
          removeVariableCodeSyntax(platform: string) {
            delete this.codeSyntax[platform];
          },
          remove() {
            const idx = variables.indexOf(this);
            if (idx > -1) variables.splice(idx, 1);
          }
        };
        variables.push(newVar);
        return newVar;
      }
    }
  };

  return { figmaMock, collections, variables };
}

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
          "primary": {
            "$type": "color",
            "$value": "#ffffff",
            "$modes": {
              "Dark": "#000000"
            }
          },
          "surface": {
            "$type": "color",
            "$value": "{Tokens.colors.primary}",
            "$modes": {
              "Dark": "{Tokens.colors.primary}"
            }
          }
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
          "primary": {
            "$type": "color",
            "$value": "#ffffff",
            "$modes": {
              "Dark": "#000000"
            }
          }
        }
      }
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
          Primary: {
            $type: "color",
            $value: "#ffffff",
            Hover: {
              $type: "color",
              $value: "#eeeeee",
            },
          },
          secondary: {
            $type: "color",
            $value: "#000000",
          },
        },
      },
    };

    const result = await importFromDtcg(JSON.stringify(dtcgJson), figmaMock);

    expect(result.quarantined).toEqual(["Tokens.colors.Primary"]);

    const variables = figmaMock.variables.getLocalVariables();
    expect(variables.length).toBe(1);
    expect(variables[0].name).toBe("colors/secondary");
  });

  it("sets a variable's description from $description", async () => {
    const { figmaMock } = createMockFigma();

    const dtcgJson = {
      Tokens: {
        colors: {
          primary: {
            $type: "color",
            $value: "#ffffff",
            $description: "The Goodlord teal. Use for primary button backgrounds.",
          },
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
          primary: {
            $type: "color",
            $value: "#ffffff",
            $extensions: { figma: { scopes: ["FRAME_FILL", "SHAPE_FILL"] } },
          },
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
          width: { $type: "dimension", $value: "16px" },
        },
      },
    };

    await importFromDtcg(JSON.stringify(dtcgJson), figmaMock);

    const widthVar = figmaMock.variables.getLocalVariables()[0];
    expect(widthVar.scopes).toEqual(["WIDTH_HEIGHT"]);
  });

  it("sets a variable's codeSyntax from $extensions.figma.codeSyntax", async () => {
    const { figmaMock } = createMockFigma();

    const dtcgJson = {
      Tokens: {
        colors: {
          primary: {
            $type: "color",
            $value: "#ffffff",
            $extensions: {
              figma: { codeSyntax: { WEB: "var(--colors-primary)", ANDROID: "colorsPrimary" } },
            },
          },
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
          primary: {
            $type: "color",
            $value: "#ffffff",
            $extensions: { figma: { codeSyntax: { WEB: "var(--colors-primary)" } } },
          },
        },
      },
    };
    await importFromDtcg(JSON.stringify(withCodeSyntax), figmaMock);

    const withoutCodeSyntax = {
      Tokens: {
        colors: {
          primary: { $type: "color", $value: "#ffffff" },
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
          primary: {
            $type: "color",
            $value: "#ffffff",
            $extensions: { figma: { hiddenFromPublishing: true } },
          },
        },
      },
    };

    await importFromDtcg(JSON.stringify(dtcgJson), figmaMock);

    const primaryVar = figmaMock.variables.getLocalVariables()[0];
    expect(primaryVar.hiddenFromPublishing).toBe(true);
  });

  it("sets a collection's hiddenFromPublishing from the collection's own $extensions.figma", async () => {
    const { figmaMock } = createMockFigma();

    const dtcgJson = {
      Tokens: {
        $extensions: { figma: { hiddenFromPublishing: true } },
        colors: {
          primary: { $type: "color", $value: "#ffffff" },
        },
      },
    };

    await importFromDtcg(JSON.stringify(dtcgJson), figmaMock);

    const collection = figmaMock.variables.getLocalVariableCollections()[0];
    expect(collection.hiddenFromPublishing).toBe(true);
  });
});
