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
