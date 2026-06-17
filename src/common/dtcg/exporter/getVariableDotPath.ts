import { getVariablePath } from "../utils/getVariablePath";

// Resolve dynamic variable reference path using local cache or API fallback.
export function getVariableDotPath(
  varId: string,
  variableMap: Map<string, string>,
  figmaInstance?: typeof figma
): string {
  if (variableMap.has(varId)) {
    return variableMap.get(varId)!;
  }

  if (figmaInstance) {
    try {
      const refVar = figmaInstance.variables.getVariableById(varId);
      if (refVar) {
        const col = figmaInstance.variables.getVariableCollectionById(refVar.variableCollectionId);
        const dotPath = getVariablePath(col?.name, refVar.name);
        variableMap.set(varId, dotPath); // cache it
        return dotPath;
      }
    } catch (e) {
      console.error("Failed to dynamically resolve variable path for ID:", varId, e);
    }
  }

  return `unknown-${varId}`;
}
