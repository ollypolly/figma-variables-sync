// Convert Figma VariableResolvedDataType to DTCG type string
export function figmaTypeToDtcg(type: VariableResolvedDataType): string {
  if (type === "COLOR") return "color";
  if (type === "FLOAT") return "number";
  if (type === "BOOLEAN") return "boolean";
  return "string";
}
