import { dtcgTypeToFigma } from "../utils/dtcgTypeToFigma";
import { parseColor } from "../color/parseColor";

function defaultValueForType(figmaType: VariableResolvedDataType): VariableValue {
  switch (figmaType) {
    case "COLOR":
      return { r: 0, g: 0, b: 0, a: 1 };
    case "FLOAT":
      return 0;
    case "BOOLEAN":
      return false;
    default:
      return "";
  }
}

// Resolve a DTCG token value to standard Figma VariableValue.
export function resolveDtcgValue(
  val: any,
  type: string,
  pathToVariableIdMap: Map<string, string>
): VariableValue {
  const figmaType = dtcgTypeToFigma(type);

  if (typeof val === "string" && val.startsWith("{") && val.endsWith("}")) {
    const refPath = val.slice(1, -1);
    const varId = pathToVariableIdMap.get(refPath);
    if (varId) {
      return { type: "VARIABLE_ALIAS", id: varId };
    }
    console.warn(`Could not resolve alias reference: ${refPath}`);
    return defaultValueForType(figmaType);
  }

  if (figmaType === "COLOR" && typeof val === "string") {
    return parseColor(val);
  }

  if (figmaType === "FLOAT") {
    if (typeof val === "string") {
      const parsed = parseFloat(val);
      if (!isNaN(parsed)) {
        return parsed;
      }
    }
    if (val && typeof val === "object" && typeof val.value === "number") {
      return val.value;
    }
    if (val && typeof val === "object" && typeof val.value === "string") {
      const parsed = parseFloat(val.value);
      if (!isNaN(parsed)) {
        return parsed;
      }
    }
  }

  return val;
}
