/**
 * W3C Design Tokens Community Group (DTCG) Translation Engine
 * Maps Figma native variables & modes to/from W3C DTCG format.
 */

// Helper to sanitize collection, variable, and mode names for DTCG compatibility.
export function sanitizeName(name: string): string {
  return name
    .trim()
    .replace(/[\/\.]/g, "-") // replace slashes and dots with hyphens
    .replace(/[{}]/g, "")    // remove curly braces
    .replace(/\s+/g, "-");   // replace spaces with hyphens
}

// Convert a Figma color object {r, g, b, a} to a Hex string.
export function figmaColorToHex(color: { r: number; g: number; b: number; a?: number }): string {
  const r = Math.round(color.r * 255);
  const g = Math.round(color.g * 255);
  const b = Math.round(color.b * 255);
  const a = color.a !== undefined ? Math.round(color.a * 255) : 255;

  const toHex = (val: number) => val.toString(16).padStart(2, "0");

  if (a === 255) {
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toLowerCase();
  }
  return `#${toHex(r)}${toHex(g)}${toHex(b)}${toHex(a)}`.toLowerCase();
}

// Convert a Hex/RGB/RGBA string to a Figma color object {r, g, b, a}.
export function parseColor(colorStr: string): { r: number; g: number; b: number; a: number } {
  const clean = colorStr.trim().toLowerCase();

  // Hex format
  if (clean.startsWith("#")) {
    const hex = clean.substring(1);
    if (hex.length === 3 || hex.length === 4) {
      const r = parseInt(hex[0] + hex[0], 16) / 255;
      const g = parseInt(hex[1] + hex[1], 16) / 255;
      const b = parseInt(hex[2] + hex[2], 16) / 255;
      const a = hex.length === 4 ? parseInt(hex[3] + hex[3], 16) / 255 : 1;
      return { r, g, b, a };
    }
    if (hex.length === 6 || hex.length === 8) {
      const r = parseInt(hex.substring(0, 2), 16) / 255;
      const g = parseInt(hex.substring(2, 4), 16) / 255;
      const b = parseInt(hex.substring(4, 6), 16) / 255;
      const a = hex.length === 8 ? parseInt(hex.substring(6, 8), 16) / 255 : 1;
      return { r, g, b, a };
    }
  }

  // RGB / RGBA format
  if (clean.startsWith("rgb")) {
    const matches = clean.match(/rgba?\(?\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)?/);
    if (matches) {
      const r = parseInt(matches[1], 10) / 255;
      const g = parseInt(matches[2], 10) / 255;
      const b = parseInt(matches[3], 10) / 255;
      const a = matches[4] !== undefined ? parseFloat(matches[4]) : 1;
      return { r, g, b, a };
    }
  }

  // Fallback to black
  return { r: 0, g: 0, b: 0, a: 1 };
}

// Convert DTCG type string to Figma VariableResolvedDataType
export function dtcgTypeToFigma(type: string): VariableResolvedDataType {
  const lower = type.toLowerCase();
  if (lower === "color") return "COLOR";
  if (lower === "number" || lower === "dimension") return "FLOAT";
  if (lower === "boolean") return "BOOLEAN";
  return "STRING";
}

// Convert Figma VariableResolvedDataType to DTCG type string
export function figmaTypeToDtcg(type: VariableResolvedDataType): string {
  if (type === "COLOR") return "color";
  if (type === "FLOAT") return "number";
  if (type === "BOOLEAN") return "boolean";
  return "string";
}

// Flat structure representing a parsed token for simple diffs and processing.
export interface ParsedToken {
  path: string[]; // e.g. ["brand", "color", "primary"]
  type: string;   // e.g. "color"
  value: any;     // raw default value or alias reference
  modes?: Record<string, any>; // sanitized mode override values
}

// Recursively traverse a W3C DTCG JSON object to extract flat list of tokens.
export function findTokens(obj: any, path: string[] = []): ParsedToken[] {
  if (!obj || typeof obj !== "object") return [];

  if ("$value" in obj) {
    return [
      {
        path,
        type: obj.$type || "string",
        value: obj.$value,
        modes: obj.$modes,
      },
    ];
  }

  const tokens: ParsedToken[] = [];
  for (const key of Object.keys(obj)) {
    if (key.startsWith("$")) continue; // Skip metadata keys like $modes, $type
    tokens.push(...findTokens(obj[key], [...path, key]));
  }
  return tokens;
}

// Parse DTCG JSON into root-level modes and flat tokens.
export function parseDtcg(jsonStr: string): { modes: Record<string, any>; tokens: ParsedToken[] } {
  try {
    const data = JSON.parse(jsonStr);
    const rootModes = data.$modes || {};
    const tokens = findTokens(data);
    return { modes: rootModes, tokens };
  } catch (e) {
    console.error("Failed to parse DTCG JSON:", e);
    return { modes: {}, tokens: [] };
  }
}

// Helper to set value at path in a nested object.
function setPath(obj: any, path: string[], value: any) {
  let current = obj;
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i];
    if (!(key in current)) {
      current[key] = {};
    }
    current = current[key];
  }
  current[path[path.length - 1]] = value;
}

// Resolve dynamic variable reference path using local cache or API fallback.
function getVariableDotPath(
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
        const colName = col ? sanitizeName(col.name) : "library";
        const varName = refVar.name.split("/").map(sanitizeName).join(".");
        const dotPath = `${colName}.${varName}`;
        variableMap.set(varId, dotPath); // cache it
        return dotPath;
      }
    } catch (e) {
      console.error("Failed to dynamically resolve variable path for ID:", varId, e);
    }
  }

  return `unknown-${varId}`;
}

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

// Resolve a DTCG token value to standard Figma VariableValue.
function resolveDtcgValue(
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
    const colName = sanitizeName(col.name);
    const varName = variable.name.split("/").map(sanitizeName).join(".");
    pathToVariableIdMap.set(`${colName}.${varName}`, variable.id);
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

    for (let i = 0; i < neededModeNames.length; i++) {
      const modeName = neededModeNames[i];
      if (i < existingModes.length) {
        collection.renameMode(existingModes[i].modeId, modeName);
      } else {
        collection.addMode(modeName);
      }
    }

    // Refresh collection references after mode adjustments
    const updatedCollection = figmaInstance.variables.getLocalVariableCollections().find(c => c.id === collection!.id)!;

    // 3. Find/create/verify variable instances
    for (const t of colTokens) {
      const varName = t.path.slice(1).map(sanitizeName).join("/");
      const dotPath = `${colName}.${t.path.slice(1).map(sanitizeName).join(".")}`;
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
      const dotPath = `${colName}.${t.path.slice(1).map(sanitizeName).join(".")}`;
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
