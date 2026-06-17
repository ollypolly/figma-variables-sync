import { sanitizeName } from "../utils/sanitizeName";
import { figmaColorToHex } from "../color/figmaColorToHex";
import { figmaTypeToDtcg } from "../utils/figmaTypeToDtcg";
import { setPath } from "../utils/setPath";
import { getVariableDotPath } from "./getVariableDotPath";

// Export Figma local variables to DTCG JSON format.
export function exportToDtcg(
  collections: VariableCollection[],
  variables: Variable[],
  figmaInstance?: typeof figma
): string {
  // 1. Build a map of all variable IDs to their dot-notation paths.
  const variableMap = new Map<string, string>();
  const collectionMap = new Map<string, VariableCollection>();

  for (const col of collections) {
    collectionMap.set(col.id, col);
  }

  for (const variable of variables) {
    const col = collectionMap.get(variable.variableCollectionId);
    if (!col) continue;
    const colName = sanitizeName(col.name);
    const varName = variable.name.split("/").map(sanitizeName).join(".");
    variableMap.set(variable.id, `${colName}.${varName}`);
  }

  // 2. Build DTCG structure
  const root: any = {};

  // Construct file-level modes declaring all modes + fallback mappings.
  const rootModes: Record<string, any> = {};
  for (const col of collections) {
    const colModes = col.modes;
    if (colModes.length > 0) {
      const primaryMode = sanitizeName(colModes[0].name);
      rootModes[primaryMode] = rootModes[primaryMode] || {};
      for (let i = 1; i < colModes.length; i++) {
        const otherMode = sanitizeName(colModes[i].name);
        rootModes[otherMode] = rootModes[otherMode] || { $fallback: primaryMode };
      }
    }
  }

  if (Object.keys(rootModes).length > 0) {
    root.$modes = rootModes;
  }

  // Helper to convert variable value to DTCG representation.
  const valToDtcg = (val: VariableValue, type: VariableResolvedDataType): any => {
    if (val && typeof val === "object" && "type" in val && val.type === "VARIABLE_ALIAS") {
      const refPath = getVariableDotPath(val.id, variableMap, figmaInstance);
      return `{${refPath}}`;
    }
    if (type === "COLOR") {
      return figmaColorToHex(val as { r: number; g: number; b: number; a?: number });
    }
    return val;
  };

  // 3. Populate each token in the tree.
  for (const variable of variables) {
    const col = collectionMap.get(variable.variableCollectionId);
    if (!col) continue;

    const colName = sanitizeName(col.name);
    const varNameSegments = variable.name.split("/").map(sanitizeName);
    const fullPath = [colName, ...varNameSegments];

    const colModes = col.modes;
    if (colModes.length === 0) continue;

    // First mode is the default mode
    const defaultMode = colModes[0];
    const defaultValue = variable.valuesByMode[defaultMode.modeId];

    const tokenObject: any = {
      $type: figmaTypeToDtcg(variable.resolvedType),
      $value: valToDtcg(defaultValue, variable.resolvedType),
    };

    // If there are other modes, add them to $modes object
    if (colModes.length > 1) {
      const modesOverrides: Record<string, any> = {};
      for (let i = 1; i < colModes.length; i++) {
        const otherMode = colModes[i];
        const otherVal = variable.valuesByMode[otherMode.modeId];
        // We can write it explicitly so importer can map it back
        modesOverrides[sanitizeName(otherMode.name)] = valToDtcg(otherVal, variable.resolvedType);
      }
      tokenObject.$modes = modesOverrides;
    }

    setPath(root, fullPath, tokenObject);
  }

  return JSON.stringify(root, null, 2);
}
