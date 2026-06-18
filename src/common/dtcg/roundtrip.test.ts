import { describe, it, expect } from "vitest";
import { importFromDtcg } from "./importer/importFromDtcg";
import { exportToDtcg } from "./exporter/exportToDtcg";

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
          setValueForMode(modeId: string, value: any) {
             this.valuesByMode[modeId] = value;
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

const originalJson = {
  "$modes": {
    "Light": {},
    "Dark": {
      "$fallback": "Light"
    }
  },
  "Tokens": {
    "brand": {
      "primary": {
        "$type": "color",
        "$value": "#0284c7",
        "$modes": {
          "Dark": "#38bdf8"
        }
      },
      "secondary": {
        "$type": "color",
        "$value": "#4f46e5",
        "$modes": {
          "Dark": "#818cf8"
        }
      }
    },
    "surface": {
      "background": {
        "$type": "color",
        "$value": "#ffffff",
        "$modes": {
          "Dark": "#0f172a"
        }
      },
      "foreground": {
        "$type": "color",
        "$value": "#0f172a",
        "$modes": {
          "Dark": "#f8fafc"
        }
      }
    },
    "spacing": {
      "small": {
        "$type": "dimension",
        "$value": "8px"
      },
      "medium": {
        "$type": "dimension",
        "$value": "16px"
      },
      "large": {
        "$type": "dimension",
        "$value": "24px"
      }
    },
    "radius": {
      "small": {
        "$type": "dimension",
        "$value": "4px"
      },
      "full": {
        "$type": "dimension",
        "$value": "9999px"
      }
    },
    "font": {
      "size": {
        "body": {
          "$type": "dimension",
          "$value": "16px"
        }
      },
      "weight": {
        "bold": {
          "$type": "string",
          "$value": "bold"
        }
      }
    }
  }
};

describe("DTCG Roundtrip integration test", () => {
  it("should import design-tokens.json structure, create correct Figma variables/modes, and export them back to equivalent JSON", async () => {
    const { figmaMock } = createMockFigma();

    const originalJsonStr = JSON.stringify(originalJson);

    // Import the design-tokens JSON
    await importFromDtcg(originalJsonStr, figmaMock);

    // Check that local variables were created correctly
    const variables = figmaMock.variables.getLocalVariables();
    expect(variables.length).toBeGreaterThan(0);

    // Export them back
    const exportedJsonStr = exportToDtcg(
      figmaMock.variables.getLocalVariableCollections(),
      figmaMock.variables.getLocalVariables(),
      figmaMock
    );
    const exportedJson = JSON.parse(exportedJsonStr);

    // Check structural equivalence:
    // Modes should match
    expect(exportedJson.$modes).toBeDefined();
    expect(exportedJson.$modes.Light).toBeDefined();
    expect(exportedJson.$modes.Dark).toEqual({ $fallback: "Light" });

    // Let's assert variables mapping matches
    const tokens = exportedJson.Tokens;
    expect(tokens).toBeDefined();

    // Color: brand/primary
    expect(tokens.brand.primary.$type).toBe("color");
    expect(tokens.brand.primary.$value).toBe("#0284c7");
    expect(tokens.brand.primary.$modes.Dark).toBe("#38bdf8");

    // Color: brand/secondary
    expect(tokens.brand.secondary.$type).toBe("color");
    expect(tokens.brand.secondary.$value).toBe("#4f46e5");
    expect(tokens.brand.secondary.$modes.Dark).toBe("#818cf8");

    // Color: surface/background
    expect(tokens.surface.background.$type).toBe("color");
    expect(tokens.surface.background.$value).toBe("#ffffff");
    expect(tokens.surface.background.$modes.Dark).toBe("#0f172a");

    // Color: surface/foreground
    expect(tokens.surface.foreground.$type).toBe("color");
    expect(tokens.surface.foreground.$value).toBe("#0f172a");
    expect(tokens.surface.foreground.$modes.Dark).toBe("#f8fafc");

    // Spacing: spacing/small (which is exported as type 'number' and value as number)
    expect(tokens.spacing.small.$type).toBe("number");
    expect(tokens.spacing.small.$value).toBe(8);

    // Spacing: spacing/medium
    expect(tokens.spacing.medium.$type).toBe("number");
    expect(tokens.spacing.medium.$value).toBe(16);

    // Spacing: spacing/large
    expect(tokens.spacing.large.$type).toBe("number");
    expect(tokens.spacing.large.$value).toBe(24);

    // Radius: radius/small
    expect(tokens.radius.small.$type).toBe("number");
    expect(tokens.radius.small.$value).toBe(4);

    // Radius: radius/full
    expect(tokens.radius.full.$type).toBe("number");
    expect(tokens.radius.full.$value).toBe(9999);

    // Font size: font/size/body
    expect(tokens.font.size.body.$type).toBe("number");
    expect(tokens.font.size.body.$value).toBe(16);

    // Font weight: font/weight/bold
    expect(tokens.font.weight.bold.$type).toBe("string");
    expect(tokens.font.weight.bold.$value).toBe("bold");
  });
});
