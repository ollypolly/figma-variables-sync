import { describe, it, expect } from "vitest";
import { exportToDtcg } from "./exportToDtcg";

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

describe("exportToDtcg", () => {
  it("should export Figma variables to a valid W3C DTCG format with modes and aliases", () => {
    const { figmaMock } = createMockFigma();

    const col = figmaMock.variables.createVariableCollection("Tokens");
    const modeLight = col.modes[0].modeId;
    const modeDark = col.addMode("Dark");
    col.renameMode(modeLight, "Light");

    const primaryColor = figmaMock.variables.createVariable("colors/primary", col.id, "COLOR");
    primaryColor.setValueForMode(modeLight, { r: 1, g: 1, b: 1 }); // #ffffff
    primaryColor.setValueForMode(modeDark, { r: 0, g: 0, b: 0 }); // #000000

    const surfaceColor = figmaMock.variables.createVariable("colors/surface", col.id, "COLOR");
    surfaceColor.setValueForMode(modeLight, { type: "VARIABLE_ALIAS", id: primaryColor.id });
    surfaceColor.setValueForMode(modeDark, { type: "VARIABLE_ALIAS", id: primaryColor.id });

    const widthDimension = figmaMock.variables.createVariable("sizes/width", col.id, "FLOAT");
    widthDimension.setValueForMode(modeLight, 16);
    widthDimension.setValueForMode(modeDark, 24);

    const jsonStr = exportToDtcg(
      figmaMock.variables.getLocalVariableCollections(),
      figmaMock.variables.getLocalVariables(),
      figmaMock
    );

    const result = JSON.parse(jsonStr);

    // Assert modes mapping exists
    expect(result.$modes).toBeDefined();
    expect(result.$modes.Light).toBeDefined();
    expect(result.$modes.Dark).toEqual({ $fallback: "Light" });

    // Assert primary color structure
    expect(result.Tokens.colors.primary.$type).toBe("color");
    expect(result.Tokens.colors.primary.$value).toBe("#ffffff");
    expect(result.Tokens.colors.primary.$modes.Dark).toBe("#000000");

    // Assert surface color reference alias
    expect(result.Tokens.colors.surface.$type).toBe("color");
    expect(result.Tokens.colors.surface.$value).toBe("{Tokens.colors.primary}");
    expect(result.Tokens.colors.surface.$modes.Dark).toBe("{Tokens.colors.primary}");

    // Assert width float dimension
    expect(result.Tokens.sizes.width.$type).toBe("number");
    expect(result.Tokens.sizes.width.$value).toBe(16);
    expect(result.Tokens.sizes.width.$modes.Dark).toBe(24);
  });
});
