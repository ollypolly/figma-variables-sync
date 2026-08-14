import { DEFAULT_VARIABLE_SCOPES, ParsedToken, TokenParseResult } from "../types";
import { sanitizeName } from "../utils/sanitizeName";
import { dtcgTypeToFigma } from "../utils/dtcgTypeToFigma";
import { parseDtcg } from "../parser/parseDtcg";
import { resolveDtcgValue } from "./resolveDtcgValue";
import { getVariablePath } from "../utils/getVariablePath";

export type ImportFromDtcgResult = Pick<TokenParseResult, "quarantined"> & {
  removed: string[];
  unresolvedAliases: string[];
};

const CODE_SYNTAX_PLATFORMS: CodeSyntaxPlatform[] = ["WEB", "ANDROID", "iOS"];

// Import W3C DTCG JSON back into native Figma variables.
export async function importFromDtcg(
  jsonStr: string,
  figmaInstance: typeof figma
): Promise<ImportFromDtcgResult> {
  const { modes: rootModes, tokens, quarantined, collectionMetadata, unresolvedAliases } = parseDtcg(jsonStr);
  if (tokens.length === 0) return { quarantined, removed: [], unresolvedAliases };

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

  // A quarantined path means "structurally ambiguous," not "removed" — never delete for it.
  const quarantinedSanitized = quarantined.map((p) => p.split(".").map(sanitizeName).join("."));
  const isProtectedByQuarantine = (dotPath: string) =>
    quarantinedSanitized.some((q) => dotPath === q || dotPath.startsWith(`${q}.`));

  // --- PASS 0: Remove Figma variables/collections whose tokens no longer exist in Git.
  const removed: string[] = [];
  for (const collection of existingCollections) {
    const colName = sanitizeName(collection.name);
    const colTokens = collectionTokensMap.get(colName);
    const colHasGitPresence = colTokens !== undefined || quarantinedSanitized.some((q) => q.split(".")[0] === colName);
    const colVariables = existingVariables.filter((v) => v.variableCollectionId === collection.id);

    if (!colHasGitPresence) {
      // Whole collection gone from Git — cascades to its variables too.
      removed.push(...colVariables.map((v) => getVariablePath(collection.name, v.name)));
      collection.remove();
      continue;
    }

    const colTokenVarNames = new Set(
      colTokens?.map((t) => t.path.slice(1).map(sanitizeName).join("/"))
    );
    for (const variable of colVariables) {
      const dotPath = getVariablePath(collection.name, variable.name);
      const stillPresent = colTokenVarNames.has(variable.name);
      if (!stillPresent && !isProtectedByQuarantine(dotPath)) {
        removed.push(dotPath);
        variable.remove();
      }
    }
  }

  // PASS 0 may have removed collections/variables — refresh the live snapshot before
  // anything below resolves paths against Figma, so a removed entity's stale id can't
  // leak into pathToVariableIdMap or get matched again by PASS 1's lookups.
  const collectionsAfterCleanup = figmaInstance.variables.getLocalVariableCollections();
  const variablesAfterCleanup = figmaInstance.variables.getLocalVariables();

  const collectionById = new Map(collectionsAfterCleanup.map((c) => [c.id, c]));
  const variableByCollectionAndName = new Map(
    variablesAfterCleanup.map((v) => [`${v.variableCollectionId}::${v.name}`, v])
  );

  const pathToVariableIdMap = new Map<string, string>();
  // Populate mapping with all existing variables first
  for (const variable of variablesAfterCleanup) {
    const col = collectionById.get(variable.variableCollectionId);
    if (!col) continue;
    const dotPath = getVariablePath(col.name, variable.name);
    pathToVariableIdMap.set(dotPath, variable.id);
  }

  // --- PASS 1: Create/verify all Collections, Modes, and Variables.
  const variableInstances = new Map<string, Variable>(); // Map dot-path to Variable instance

  for (const [colName, colTokens] of collectionTokensMap.entries()) {
    // 1. Find or create collection
    let collection = collectionsAfterCleanup.find((c) => sanitizeName(c.name) === colName);
    if (!collection) {
      collection = figmaInstance.variables.createVariableCollection(colName);
    }
    collection.hiddenFromPublishing = collectionMetadata[colName]?.hiddenFromPublishing ?? false;

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

      let variable = variableByCollectionAndName.get(`${updatedCollection.id}::${varName}`);

      if (variable && variable.resolvedType !== targetType) {
        variable.remove();
        variable = undefined;
      }

      let defaultScopes: string[] = DEFAULT_VARIABLE_SCOPES;
      if (!variable) {
        variable = figmaInstance.variables.createVariable(varName, updatedCollection.id, targetType);
        if (!t.figmaScopes && targetType === "FLOAT" && t.type.toLowerCase() === "dimension") {
          defaultScopes = ["WIDTH_HEIGHT"];
        }
      }

      variable.description = t.description ?? "";
      variable.hiddenFromPublishing = t.figmaHiddenFromPublishing ?? false;
      variable.scopes = (t.figmaScopes ?? defaultScopes) as VariableScope[];

      for (const platform of CODE_SYNTAX_PLATFORMS) {
        const value = t.figmaCodeSyntax?.[platform];
        if (value !== undefined) {
          variable.setVariableCodeSyntax(platform, value);
        } else if (variable.codeSyntax[platform] !== undefined) {
          variable.removeVariableCodeSyntax(platform);
        }
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

  return { quarantined, removed, unresolvedAliases };
}
