import { dtcgTypeToFigma } from "../utils/dtcgTypeToFigma";
import { parseColor } from "../color/parseColor";

// Resolve a DTCG token value to standard Figma VariableValue.
export function resolveDtcgValue(
  val: any,
  type: string,
  pathToVariableIdMap: Map<string, string>
): VariableValue {
  if (typeof val === "string" && val.startsWith("{") && val.endsWith("}")) {
    const refPath = val.slice(1, -1);
    const varId = pathToVariableIdMap.get(refPath);
    if (varId) {
      return { type: "VARIABLE_ALIAS", id: varId };
    }
    console.warn(`Could not resolve alias reference: ${refPath}`);
  }

  const figmaType = dtcgTypeToFigma(type);
  if (figmaType === "COLOR" && typeof val === "string") {
    return parseColor(val);
  }

  return val;
}
