import { DEFAULT_VARIABLE_SCOPES } from "../types";

const DIMENSION_SCOPES: ReadonlySet<string> = new Set([
  "GAP",
  "CORNER_RADIUS",
  "WIDTH_HEIGHT",
  "FONT_SIZE",
  "LINE_HEIGHT",
  "LETTER_SPACING",
  "PARAGRAPH_SPACING",
  "PARAGRAPH_INDENT",
  "STROKE_FLOAT",
  "EFFECT_FLOAT",
]);

export function isDimensionVariable(scopes?: readonly string[]): boolean {
  if (!scopes || scopes.length === 0) return false;
  return scopes.some((s) => DIMENSION_SCOPES.has(s));
}

// A dimension-typed token with no explicit $extensions.figma.scopes round-trips through Figma
// as WIDTH_HEIGHT, not the general ALL_SCOPES default — otherwise it would export back as a
// plain "number" instead of "dimension". Shared by the importer (what to write to a variable)
// and the diff (what git implicitly means by an unset scope), so both agree on the same value.
export function defaultScopesForDtcgType(type: string): string[] {
  return type.toLowerCase() === "dimension" ? ["WIDTH_HEIGHT"] : DEFAULT_VARIABLE_SCOPES;
}

export function figmaTypeToDtcg(
  type: VariableResolvedDataType,
  scopes?: readonly string[]
): string {
  if (type === "COLOR") return "color";
  if (type === "FLOAT") {
    if (scopes && isDimensionVariable(scopes)) return "dimension";
    return "number";
  }
  if (type === "BOOLEAN") return "boolean";
  return "string";
}
