import { sanitizeName } from "../utils/sanitizeName";
import { figmaColorToHex } from "../color/figmaColorToHex";
import { figmaTypeToDtcg, isDimensionVariable } from "../utils/figmaTypeToDtcg";
import { setPath } from "../utils/setPath";
import { getVariableDotPath } from "./getVariableDotPath";
import { getVariablePath } from "../utils/getVariablePath";


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
    const dotPath = getVariablePath(col.name, variable.name);
    variableMap.set(variable.id, dotPath);
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
  const valToDtcg = (val: VariableValue, type: VariableResolvedDataType, isDimension: boolean): any => {
    if (val && typeof val === "object" && "type" in val && val.type === "VARIABLE_ALIAS") {
      const refPath = getVariableDotPath(val.id, variableMap, figmaInstance);
      return `{${refPath}}`;
    }
    if (type === "COLOR") {
      return figmaColorToHex(val as { r: number; g: number; b: number; a?: number });
    }
    if (type === "FLOAT" && isDimension && typeof val === "number") {
      return `${val}px`;
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

    const isDim = variable.resolvedType === "FLOAT" && isDimensionVariable(variable.scopes);

    const tokenObject: any = {
      $type: figmaTypeToDtcg(variable.resolvedType, variable.scopes),
      $value: valToDtcg(defaultValue, variable.resolvedType, isDim),
    };

    // If there are other modes, add them to $modes object only if they differ from the default
    if (colModes.length > 1) {
      const modesOverrides: Record<string, any> = {};
      let hasOverride = false;
      for (let i = 1; i < colModes.length; i++) {
        const otherMode = colModes[i];
        const otherVal = variable.valuesByMode[otherMode.modeId];
        const otherValDtcg = valToDtcg(otherVal, variable.resolvedType, isDim);
        if (otherValDtcg !== tokenObject.$value) {
          modesOverrides[sanitizeName(otherMode.name)] = otherValDtcg;
          hasOverride = true;
        }
      }
      if (hasOverride) {
        tokenObject.$modes = modesOverrides;
      }
    }

    setPath(root, fullPath, tokenObject);
  }

  return JSON.stringify(root, null, 2);
}
