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

describe("LOAD_ACTIVE_PROPOSAL handler", () => {
  it("loads a persisted active proposal from clientStorage", () => {
    const stored = { number: 4, title: "Update brand colors", html_url: "https://github.com/pull/4", head_ref: "figma/proposal-1" };
    (globalThis as any).figma.clientStorage.getAsync = vi.fn().mockResolvedValue(stored);

    const postMessage = vi.fn();
    (globalThis as any).figma.ui.postMessage = postMessage;

    registerFromFigmaHandlers();
    (globalThis as any).figma.ui.onmessage(["LOAD_ACTIVE_PROPOSAL"]);

    return new Promise((resolve) => setTimeout(resolve, 0)).then(() => {
      expect(postMessage).toHaveBeenCalledWith(["ACTIVE_PROPOSAL_LOADED", stored]);
    });
  });

  it("emits null when nothing has been persisted yet", () => {
    (globalThis as any).figma.clientStorage.getAsync = vi.fn().mockResolvedValue(undefined);

    const postMessage = vi.fn();
    (globalThis as any).figma.ui.postMessage = postMessage;

    registerFromFigmaHandlers();
    (globalThis as any).figma.ui.onmessage(["LOAD_ACTIVE_PROPOSAL"]);

    return new Promise((resolve) => setTimeout(resolve, 0)).then(() => {
      expect(postMessage).toHaveBeenCalledWith(["ACTIVE_PROPOSAL_LOADED", null]);
    });
  });
});

describe("LOAD_DRAFT_DESCRIPTION handler", () => {
  it("loads a persisted draft description from clientStorage", () => {
    (globalThis as any).figma.clientStorage.getAsync = vi.fn().mockResolvedValue("Update brand colors");

    const postMessage = vi.fn();
    (globalThis as any).figma.ui.postMessage = postMessage;

    registerFromFigmaHandlers();
    (globalThis as any).figma.ui.onmessage(["LOAD_DRAFT_DESCRIPTION"]);

    return new Promise((resolve) => setTimeout(resolve, 0)).then(() => {
      expect(postMessage).toHaveBeenCalledWith(["DRAFT_DESCRIPTION_LOADED", "Update brand colors"]);
    });
  });

  it("emits an empty string when nothing has been persisted yet", () => {
    (globalThis as any).figma.clientStorage.getAsync = vi.fn().mockResolvedValue(undefined);

    const postMessage = vi.fn();
    (globalThis as any).figma.ui.postMessage = postMessage;

    registerFromFigmaHandlers();
    (globalThis as any).figma.ui.onmessage(["LOAD_DRAFT_DESCRIPTION"]);

    return new Promise((resolve) => setTimeout(resolve, 0)).then(() => {
      expect(postMessage).toHaveBeenCalledWith(["DRAFT_DESCRIPTION_LOADED", ""]);
    });
  });
});
