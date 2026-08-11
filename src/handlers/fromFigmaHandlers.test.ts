import { describe, it, expect, beforeEach, vi } from "vitest";

vi.hoisted(() => {
  (globalThis as any).figma = {
    variables: {
      getLocalVariableCollections: () => [],
      getLocalVariables: () => [],
    },
    clientStorage: { getAsync: async () => undefined, setAsync: async () => undefined },
    ui: { onmessage: undefined, postMessage: () => {} },
  };
});

import { registerFromFigmaHandlers } from "./fromFigmaHandlers";

describe("REQUEST_EXPORT handler", () => {
  beforeEach(() => {
    (globalThis as any).figma.variables.getLocalVariableCollections = vi.fn();
    (globalThis as any).figma.variables.getLocalVariables = vi.fn();
  });

  it("emits a failure result instead of hanging when export throws (e.g. a naming collision)", () => {
    const collidingCollections = [
      { id: "col-1", name: "Tokens", modes: [{ modeId: "mode-1", name: "Mode 1" }] },
    ];
    const collidingVariables = [
      {
        id: "var-1",
        name: "colors/Primary",
        variableCollectionId: "col-1",
        resolvedType: "COLOR",
        valuesByMode: { "mode-1": { r: 1, g: 1, b: 1 } },
      },
      {
        id: "var-2",
        name: "colors/Primary/Hover",
        variableCollectionId: "col-1",
        resolvedType: "COLOR",
        valuesByMode: { "mode-1": { r: 0.9, g: 0.9, b: 0.9 } },
      },
    ];
    (globalThis as any).figma.variables.getLocalVariableCollections.mockReturnValue(
      collidingCollections
    );
    (globalThis as any).figma.variables.getLocalVariables.mockReturnValue(collidingVariables);

    const postMessage = vi.fn();
    (globalThis as any).figma.ui.postMessage = postMessage;

    registerFromFigmaHandlers();
    (globalThis as any).figma.ui.onmessage(["REQUEST_EXPORT"]);

    expect(postMessage).toHaveBeenCalledWith([
      "EXPORT_RESULT",
      false,
      "",
      expect.any(String),
      ["Tokens.colors.Primary"],
    ]);
  });
});
