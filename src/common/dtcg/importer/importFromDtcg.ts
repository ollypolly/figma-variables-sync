import { ParsedToken } from "../types";
import { sanitizeName } from "../utils/sanitizeName";
import { dtcgTypeToFigma } from "../utils/dtcgTypeToFigma";
import { parseDtcg } from "../parser/parseDtcg";
import { resolveDtcgValue } from "./resolveDtcgValue";
import { getVariablePath } from "../utils/getVariablePath";


// Import W3C DTCG JSON back into native Figma variables.
export async function importFromDtcg(
  jsonStr: string,
  figmaInstance: typeof figma
): Promise<void> {
  const { modes: rootModes, tokens } = parseDtcg(jsonStr);
  if (tokens.length === 0) return;

  // Group tokens by collection (first segment of token path)
  const collectionTokensMap = new Map<string, ParsedToken[]>();
  for (const t of tokens) {
    if (t.path.length < 2) continue; // Must have collection name and variable name
    const colName = sanitizeName(t.path[0]);
    if (!collectionTokensMap.has(colName)) {
      collectionTokensMap.set(colName, []);
    }
    collectionTokensMap.get(colName)!.push(t);
  }

  const existingCollections = figmaInstance.variables.getLocalVariableCollections();
  const existingVariables = figmaInstance.variables.getLocalVariables();

  const pathToVariableIdMap = new Map<string, string>();
  // Populate mapping with all existing variables first
  for (const variable of existingVariables) {
    const col = existingCollections.find((c) => c.id === variable.variableCollectionId);
    if (!col) continue;
    const dotPath = getVariablePath(col.name, variable.name);
    pathToVariableIdMap.set(dotPath, variable.id);
  }

  // --- PASS 1: Create/verify all Collections, Modes, and Variables.
  const variableInstances = new Map<string, Variable>(); // Map dot-path to Variable instance

  for (const [colName, colTokens] of collectionTokensMap.entries()) {
    // 1. Find or create collection
    let collection = existingCollections.find((c) => sanitizeName(c.name) === colName);
    if (!collection) {
      collection = figmaInstance.variables.createVariableCollection(colName);
    }

    // 2. Identify and setup modes for this collection
    const neededModes = new Set<string>();
    const rootModeNames = Object.keys(rootModes);
    const defaultModeName = rootModeNames[0] || "Mode 1";
    neededModes.add(defaultModeName);

    for (const t of colTokens) {
      if (t.modes) {
        for (const m of Object.keys(t.modes)) {
          neededModes.add(m);
        }
      }
    }

    const neededModeNames = Array.from(neededModes);
    const existingModes = collection.modes;

    let hitModeLimit = false;
    for (let i = 0; i < neededModeNames.length; i++) {
      const modeName = neededModeNames[i];
      if (i < existingModes.length) {
        collection.renameMode(existingModes[i].modeId, modeName);
      } else {
        try {
          collection.addMode(modeName);
        } catch (e: any) {
          console.warn(`Could not add mode "${modeName}":`, e);
          hitModeLimit = true;
          break; // Stop adding more modes since the plan limit is reached
        }
      }
    }

    if (hitModeLimit && typeof figmaInstance.notify === "function") {
      figmaInstance.notify(
        "Figma plan limit: Only the default mode was imported. Upgrade your Figma plan to import multiple modes.",
        { timeout: 6000 }
      );
    }

    // Refresh collection references after mode adjustments
    const updatedCollection = figmaInstance.variables.getLocalVariableCollections().find(c => c.id === collection!.id)!;

    // 3. Find/create/verify variable instances
    for (const t of colTokens) {
      const varName = t.path.slice(1).map(sanitizeName).join("/");
      const dotPath = getVariablePath(t.path[0], varName);
      const targetType = dtcgTypeToFigma(t.type);

      let variable = existingVariables.find(
        (v) => v.variableCollectionId === updatedCollection.id && v.name === varName
      );

      if (variable && variable.resolvedType !== targetType) {
        variable.remove();
        variable = undefined;
      }

      if (!variable) {
        variable = figmaInstance.variables.createVariable(varName, updatedCollection.id, targetType);
      }

      pathToVariableIdMap.set(dotPath, variable.id);
      variableInstances.set(dotPath, variable);
    }
  }

  // --- PASS 2: Resolve values and alias references per mode.
  for (const [colName, colTokens] of collectionTokensMap.entries()) {
    const collection = figmaInstance.variables
      .getLocalVariableCollections()
      .find((c) => sanitizeName(c.name) === colName)!;

    const modesInFigma = collection.modes;

    for (const t of colTokens) {
      const dotPath = getVariablePath(t.path[0], t.path.slice(1).join("/"));
      const variable = variableInstances.get(dotPath);
      if (!variable) continue;

      // First mode in Figma is default mode
      const defaultMode = modesInFigma[0];
      const defaultValResolved = resolveDtcgValue(t.value, t.type, pathToVariableIdMap);
      variable.setValueForMode(defaultMode.modeId, defaultValResolved);

      // Remaining modes
      for (let i = 1; i < modesInFigma.length; i++) {
        const m = modesInFigma[i];
        const modeNameSanitized = sanitizeName(m.name);
        
        let valForMode = t.value; // Fallback to token default
        if (t.modes && t.modes[modeNameSanitized] !== undefined) {
          valForMode = t.modes[modeNameSanitized];
        }

        const resolvedVal = resolveDtcgValue(valForMode, t.type, pathToVariableIdMap);
        variable.setValueForMode(m.modeId, resolvedVal);
      }
    }
  }
}
