import { describe, it, expect, vi } from "vitest";

vi.hoisted(() => {
  (globalThis as any).figma = {
    clientStorage: { getAsync: async () => undefined, setAsync: async () => undefined },
    ui: { onmessage: undefined, postMessage: () => {}, resize: () => {} },
  };
});

import { registerToFigmaHandlers } from "./toFigmaHandlers";

describe("REQUEST_IMPORT handler", () => {
  it("surfaces quarantined paths in the import result instead of silently losing them", () => {
    const dtcgJson = JSON.stringify({
      Tokens: {
        colors: {
          Primary: {
            $type: "color",
            $value: "#ffffff",
            Hover: { $type: "color", $value: "#eeeeee" },
          },
          secondary: { $type: "color", $value: "#000000" },
        },
      },
    });

    const postMessage = vi.fn();
    (globalThis as any).figma.ui.postMessage = postMessage;

    const collections: any[] = [];
    const variables: any[] = [];
    (globalThis as any).figma.variables = {
      getLocalVariableCollections: () => collections,
      getLocalVariables: () => variables,
      createVariableCollection: (name: string) => {
        const id = `col-${collections.length + 1}`;
        const newCol = {
          id,
          name,
          modes: [{ modeId: `${id}-mode-1`, name: "Mode 1" }],
          renameMode(modeId: string, modeName: string) {
            const m = this.modes.find((mode: any) => mode.modeId === modeId);
            if (m) m.name = modeName;
          },
          addMode(modeName: string) {
            const modeId = `${id}-mode-${this.modes.length + 1}`;
            this.modes.push({ modeId, name: modeName });
            return modeId;
          },
        };
        collections.push(newCol);
        return newCol;
      },
      createVariable: (name: string, collectionId: string, resolvedType: string) => {
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
        };
        variables.push(newVar);
        return newVar;
      },
    };

    registerToFigmaHandlers();
    (globalThis as any).figma.ui.onmessage(["REQUEST_IMPORT", dtcgJson]);

    return new Promise((resolve) => setTimeout(resolve, 0)).then(() => {
      expect(postMessage).toHaveBeenCalledWith([
        "IMPORT_RESULT",
        true,
        "Variables imported successfully.",
        ["Tokens.colors.Primary"],
      ]);
    });
  });
});
