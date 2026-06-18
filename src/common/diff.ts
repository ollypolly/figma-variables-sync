import { parseDtcg, ParsedToken } from "./dtcg";

export interface DiffItem {
  path: string[];
  dotPath: string;
  type: "added" | "modified" | "deleted";
  figmaVal: string; // The Figma local value (new state when proposing, old state when updating)
  gitVal: string;   // The Git repository value (old state when proposing, new state when updating)
}

function formatTokenVal(t: ParsedToken): string {
  let str = String(t.value);
  if (t.modes) {
    const modeStr = Object.entries(t.modes)
      .map(([m, v]) => `${m}: ${v}`)
      .join(", ");
    if (modeStr) {
      str = `${str} (${modeStr})`;
    }
  }
  return str;
}

/**
 * Computes changes between Figma (current local state) and Git (stored repository state).
 * 
 * For Outgoing Changes (Proposals):
 *   Figma is target (new), Git is source (old).
 *   - "added": variable exists in Figma but not Git.
 *   - "modified": values differ.
 *   - "deleted": variable exists in Git but not Figma.
 * 
 * For Incoming Changes (Updates):
 *   Git is target (new), Figma is source (old).
 *   - "added": variable exists in Git but not Figma.
 *   - "modified": values differ.
 *   - "deleted": variable exists in Figma but not Git.
 */
export function computeDiff(figmaJson: string, gitJson: string, mode: "proposals" | "updates"): DiffItem[] {
  const figmaData = parseDtcg(figmaJson);
  const gitData = parseDtcg(gitJson);

  const figmaMap = new Map<string, ParsedToken>();
  for (const t of figmaData.tokens) {
    figmaMap.set(t.path.join("."), t);
  }

  const gitMap = new Map<string, ParsedToken>();
  for (const t of gitData.tokens) {
    gitMap.set(t.path.join("."), t);
  }

  const diffs: DiffItem[] = [];

  const sourceMap = mode === "proposals" ? gitMap : figmaMap;
  const targetMap = mode === "proposals" ? figmaMap : gitMap;

  // Added and modified in target (new)
  for (const [key, targetToken] of targetMap.entries()) {
    const sourceToken = sourceMap.get(key);
    if (!sourceToken) {
      diffs.push({
        path: targetToken.path,
        dotPath: key,
        type: "added",
        figmaVal: mode === "proposals" ? formatTokenVal(targetToken) : "",
        gitVal: mode === "proposals" ? "" : formatTokenVal(targetToken),
      });
    } else {
      const targetValStr = formatTokenVal(targetToken);
      const sourceValStr = formatTokenVal(sourceToken);
      if (targetValStr !== sourceValStr) {
        diffs.push({
          path: targetToken.path,
          dotPath: key,
          type: "modified",
          figmaVal: mode === "proposals" ? targetValStr : sourceValStr,
          gitVal: mode === "proposals" ? sourceValStr : targetValStr,
        });
      }
    }
  }

  // Deleted in target (new)
  for (const [key, sourceToken] of sourceMap.entries()) {
    if (!targetMap.has(key)) {
      diffs.push({
        path: sourceToken.path,
        dotPath: key,
        type: "deleted",
        figmaVal: mode === "proposals" ? "" : formatTokenVal(sourceToken),
        gitVal: mode === "proposals" ? formatTokenVal(sourceToken) : "",
      });
    }
  }

  return diffs;
}
