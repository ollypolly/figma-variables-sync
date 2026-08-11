import { describe, it, expect } from "vitest";
import { exportToDtcg, NamingCollisionError } from "./exportToDtcg";
import { createMockFigma } from "@common/testUtils/mockFigma";

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

    // Assert surface color reference alias (optimized: no override since it matches the default)
    expect(result.Tokens.colors.surface.$type).toBe("color");
    expect(result.Tokens.colors.surface.$value).toBe("{Tokens.colors.primary}");
    expect(result.Tokens.colors.surface.$modes).toBeUndefined();

    // Assert width float dimension
    expect(result.Tokens.sizes.width.$type).toBe("number");
    expect(result.Tokens.sizes.width.$value).toBe(16);
    expect(result.Tokens.sizes.width.$modes.Dark).toBe(24);
  });

  it("should throw a clear error when a variable name collides with a sibling's path (e.g. Primary and Primary/Hover)", () => {
    const { figmaMock } = createMockFigma();

    const col = figmaMock.variables.createVariableCollection("Tokens");
    const mode = col.modes[0].modeId;

    const primary = figmaMock.variables.createVariable("colors/Primary", col.id, "COLOR");
    primary.setValueForMode(mode, { r: 1, g: 1, b: 1 });

    const primaryHover = figmaMock.variables.createVariable("colors/Primary/Hover", col.id, "COLOR");
    primaryHover.setValueForMode(mode, { r: 0.9, g: 0.9, b: 0.9 });

    let error: unknown;
    try {
      exportToDtcg(
        figmaMock.variables.getLocalVariableCollections(),
        figmaMock.variables.getLocalVariables(),
        figmaMock
      );
    } catch (e) {
      error = e;
    }

    expect(error).toBeInstanceOf(NamingCollisionError);
    expect((error as NamingCollisionError).collidingPaths).toEqual(["Tokens.colors.Primary"]);
  });

  it("exports a variable's description as $description", () => {
    const { figmaMock } = createMockFigma();

    const col = figmaMock.variables.createVariableCollection("Tokens");
    const mode = col.modes[0].modeId;

    const primary = figmaMock.variables.createVariable("colors/primary", col.id, "COLOR");
    primary.description = "The Goodlord teal. Use for primary button backgrounds.";
    primary.setValueForMode(mode, { r: 1, g: 1, b: 1 });

    const jsonStr = exportToDtcg(
      figmaMock.variables.getLocalVariableCollections(),
      figmaMock.variables.getLocalVariables(),
      figmaMock
    );
    const result = JSON.parse(jsonStr);

    expect(result.Tokens.colors.primary.$description).toBe(
      "The Goodlord teal. Use for primary button backgrounds."
    );
  });

  it("omits $description when a variable has no description", () => {
    const { figmaMock } = createMockFigma();

    const col = figmaMock.variables.createVariableCollection("Tokens");
    const mode = col.modes[0].modeId;

    const primary = figmaMock.variables.createVariable("colors/primary", col.id, "COLOR");
    primary.setValueForMode(mode, { r: 1, g: 1, b: 1 });

    const jsonStr = exportToDtcg(
      figmaMock.variables.getLocalVariableCollections(),
      figmaMock.variables.getLocalVariables(),
      figmaMock
    );
    const result = JSON.parse(jsonStr);

    expect(result.Tokens.colors.primary.$description).toBeUndefined();
  });

  it("exports a variable's scopes under $extensions.figma.scopes", () => {
    const { figmaMock } = createMockFigma();

    const col = figmaMock.variables.createVariableCollection("Tokens");
    const mode = col.modes[0].modeId;

    const primary = figmaMock.variables.createVariable("colors/primary", col.id, "COLOR");
    primary.scopes = ["FRAME_FILL", "SHAPE_FILL"];
    primary.setValueForMode(mode, { r: 1, g: 1, b: 1 });

    const jsonStr = exportToDtcg(
      figmaMock.variables.getLocalVariableCollections(),
      figmaMock.variables.getLocalVariables(),
      figmaMock
    );
    const result = JSON.parse(jsonStr);

    expect(result.Tokens.colors.primary.$extensions.figma.scopes).toEqual([
      "FRAME_FILL",
      "SHAPE_FILL",
    ]);
  });

  it("exports a variable's codeSyntax under $extensions.figma.codeSyntax", () => {
    const { figmaMock } = createMockFigma();

    const col = figmaMock.variables.createVariableCollection("Tokens");
    const mode = col.modes[0].modeId;

    const primary = figmaMock.variables.createVariable("colors/primary", col.id, "COLOR");
    primary.setVariableCodeSyntax("WEB", "var(--colors-primary)");
    primary.setVariableCodeSyntax("ANDROID", "colorsPrimary");
    primary.setValueForMode(mode, { r: 1, g: 1, b: 1 });

    const jsonStr = exportToDtcg(
      figmaMock.variables.getLocalVariableCollections(),
      figmaMock.variables.getLocalVariables(),
      figmaMock
    );
    const result = JSON.parse(jsonStr);

    expect(result.Tokens.colors.primary.$extensions.figma.codeSyntax).toEqual({
      WEB: "var(--colors-primary)",
      ANDROID: "colorsPrimary",
    });
  });

  it("omits $extensions.figma.codeSyntax when a variable has no code syntax defined", () => {
    const { figmaMock } = createMockFigma();

    const col = figmaMock.variables.createVariableCollection("Tokens");
    const mode = col.modes[0].modeId;

    const primary = figmaMock.variables.createVariable("colors/primary", col.id, "COLOR");
    primary.setValueForMode(mode, { r: 1, g: 1, b: 1 });

    const jsonStr = exportToDtcg(
      figmaMock.variables.getLocalVariableCollections(),
      figmaMock.variables.getLocalVariables(),
      figmaMock
    );
    const result = JSON.parse(jsonStr);

    expect(result.Tokens.colors.primary.$extensions).toBeUndefined();
  });

  it("exports hiddenFromPublishing under $extensions.figma when true", () => {
    const { figmaMock } = createMockFigma();

    const col = figmaMock.variables.createVariableCollection("Tokens");
    const mode = col.modes[0].modeId;

    const primary = figmaMock.variables.createVariable("colors/primary", col.id, "COLOR");
    primary.hiddenFromPublishing = true;
    primary.setValueForMode(mode, { r: 1, g: 1, b: 1 });

    const jsonStr = exportToDtcg(
      figmaMock.variables.getLocalVariableCollections(),
      figmaMock.variables.getLocalVariables(),
      figmaMock
    );
    const result = JSON.parse(jsonStr);

    expect(result.Tokens.colors.primary.$extensions.figma.hiddenFromPublishing).toBe(true);
  });

  it("omits hiddenFromPublishing when false", () => {
    const { figmaMock } = createMockFigma();

    const col = figmaMock.variables.createVariableCollection("Tokens");
    const mode = col.modes[0].modeId;

    const primary = figmaMock.variables.createVariable("colors/primary", col.id, "COLOR");
    primary.setValueForMode(mode, { r: 1, g: 1, b: 1 });

    const jsonStr = exportToDtcg(
      figmaMock.variables.getLocalVariableCollections(),
      figmaMock.variables.getLocalVariables(),
      figmaMock
    );
    const result = JSON.parse(jsonStr);

    expect(result.Tokens.colors.primary.$extensions).toBeUndefined();
  });

  it("exports a hidden collection's hiddenFromPublishing under the collection's own $extensions.figma", () => {
    const { figmaMock } = createMockFigma();

    const col = figmaMock.variables.createVariableCollection("Tokens");
    col.hiddenFromPublishing = true;
    const mode = col.modes[0].modeId;

    const primary = figmaMock.variables.createVariable("colors/primary", col.id, "COLOR");
    primary.setValueForMode(mode, { r: 1, g: 1, b: 1 });

    const jsonStr = exportToDtcg(
      figmaMock.variables.getLocalVariableCollections(),
      figmaMock.variables.getLocalVariables(),
      figmaMock
    );
    const result = JSON.parse(jsonStr);

    expect(result.Tokens.$extensions.figma.hiddenFromPublishing).toBe(true);
    // The collection-level flag must not leak onto the token nested inside it.
    expect(result.Tokens.colors.primary.$extensions).toBeUndefined();
  });

  it("omits collection $extensions when the collection is not hidden", () => {
    const { figmaMock } = createMockFigma();

    const col = figmaMock.variables.createVariableCollection("Tokens");
    const mode = col.modes[0].modeId;

    const primary = figmaMock.variables.createVariable("colors/primary", col.id, "COLOR");
    primary.setValueForMode(mode, { r: 1, g: 1, b: 1 });

    const jsonStr = exportToDtcg(
      figmaMock.variables.getLocalVariableCollections(),
      figmaMock.variables.getLocalVariables(),
      figmaMock
    );
    const result = JSON.parse(jsonStr);

    expect(result.Tokens.$extensions).toBeUndefined();
  });
});
