// Convert DTCG type string to Figma VariableResolvedDataType
export function dtcgTypeToFigma(type: string): VariableResolvedDataType {
  const lower = type.toLowerCase();
  if (lower === "color") return "COLOR";
  if (lower === "number" || lower === "dimension") return "FLOAT";
  if (lower === "boolean") return "BOOLEAN";
  return "STRING";
}
