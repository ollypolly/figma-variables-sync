import { sanitizeName } from "../utils/sanitizeName";
import { figmaColorToHex } from "../color/figmaColorToHex";
import { figmaTypeToDtcg, isDimensionVariable } from "../utils/figmaTypeToDtcg";
import { setPath } from "../utils/setPath";
import { getVariableDotPath } from "./getVariableDotPath";
import { getVariablePath } from "../utils/getVariablePath";
import { DEFAULT_VARIABLE_SCOPES } from "../types";

function isDefaultScopes(scopes: readonly string[]): boolean {
  return scopes.length === DEFAULT_VARIABLE_SCOPES.length && scopes.every((s, i) => s === DEFAULT_VARIABLE_SCOPES[i]);
}

// Carries colliding paths separately from the message so the UI can render a structured list.
export class NamingCollisionError extends Error {
  constructor(message: string, public readonly collidingPaths: string[]) {
    super(message);
    this.name = "NamingCollisionError";
  }
}

// Lexicographic order over path segments, shorter-first when one is a prefix of the
// other — matches how a group's own path sorts immediately before its children's.
function comparePathSegments(a: string[], b: string[]): number {
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    if (a[i] < b[i]) return -1;
    if (a[i] > b[i]) return 1;
  }
  return a.length - b.length;
}

export function exportToDtcg(
  collections: VariableCollection[],
  variables: Variable[],
  figmaInstance?: typeof figma
): string {
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

  // A local variable aliased to something outside the local set (a variable from an external
  // library, or one that no longer exists) can't be represented — there's no dot-path for it
  // that would survive a round trip through git.
  const externalAliasPaths: string[] = [];
  for (const variable of variables) {
    const col = collectionMap.get(variable.variableCollectionId);
    if (!col) continue;
    for (const val of Object.values(variable.valuesByMode)) {
      if (val && typeof val === "object" && "type" in val && val.type === "VARIABLE_ALIAS" && !variableMap.has(val.id)) {
        externalAliasPaths.push(getVariablePath(col.name, variable.name));
      }
    }
  }

  if (externalAliasPaths.length > 0) {
    throw new NamingCollisionError(
      `These variables are aliased to a variable from an external library, which can't be tracked here — bind them to a variable that exists locally in this file instead.`,
      externalAliasPaths
    );
  }

  const root: any = {};

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

  const valToDtcg = (val: VariableValue, type: VariableResolvedDataType, isDimension: boolean): any => {
    if (val && typeof val === "object" && "type" in val && val.type === "VARIABLE_ALIAS") {
      const refPath = getVariableDotPath(val.id, variableMap);
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

  // A path can't be both a token and a group per DTCG — detect collisions before writing anything.
  const allPaths: string[][] = [];
  for (const variable of variables) {
    const col = collectionMap.get(variable.variableCollectionId);
    if (!col) continue;
    const colName = sanitizeName(col.name);
    const varNameSegments = variable.name.split("/").map(sanitizeName);
    allPaths.push([colName, ...varNameSegments]);
  }

  // Sorting groups every path together with its extensions (a shorter path always
  // sorts immediately before anything it's a prefix of), so a single adjacent-pair
  // scan over the sorted list finds every collision — no need to compare all pairs.
  const sortedPaths = [...allPaths].sort(comparePathSegments);
  const collisions = new Set<string>();
  for (let i = 0; i < sortedPaths.length - 1; i++) {
    const a = sortedPaths[i];
    const b = sortedPaths[i + 1];
    if (a.length < b.length && a.every((segment, idx) => segment === b[idx])) {
      collisions.add(a.join("."));
    }
  }

  if (collisions.size > 0) {
    throw new NamingCollisionError(
      `These Figma variable names conflict with each other — a variable can't share a name with another variable's parent group (e.g. "Primary" can't also be the parent of "Primary/Hover"). Rename the variable(s) below in Figma, e.g. "Primary" → "Primary/Default", then check again.`,
      Array.from(collisions)
    );
  }

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

    if (variable.description) {
      tokenObject.$description = variable.description;
    }

    const figmaExtensions: any = {};
    if (!isDefaultScopes(variable.scopes)) {
      figmaExtensions.scopes = variable.scopes;
    }
    if (Object.keys(variable.codeSyntax).length > 0) {
      figmaExtensions.codeSyntax = variable.codeSyntax;
    }
    if (variable.hiddenFromPublishing) {
      figmaExtensions.hiddenFromPublishing = true;
    }
    if (Object.keys(figmaExtensions).length > 0) {
      tokenObject.$extensions = { figma: figmaExtensions };
    }

    // Only record a mode override when it actually differs from the default value.
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

  for (const col of collections) {
    if (!col.hiddenFromPublishing) continue;
    const colName = sanitizeName(col.name);
    root[colName] = root[colName] || {};
    root[colName].$extensions = { figma: { hiddenFromPublishing: true } };
  }

  return JSON.stringify(root, null, 2);
}
