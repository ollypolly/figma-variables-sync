// Resolve a variable reference to its dot-path. By the time this runs, exportToDtcg's own
// external-alias check has already thrown for any alias pointing outside variableMap, so a
// miss here can't happen in practice — the fallback just avoids a hard crash if it somehow does.
export function getVariableDotPath(varId: string, variableMap: Map<string, string>): string {
  return variableMap.get(varId) ?? `unknown-${varId}`;
}
