import { applySafeDiffsToFigmaJson } from "@common/applySafeDiffs";
import { computeDiff, type DiffItem } from "@common/diff";
import { NamingCollisionError } from "@common/dtcg";
import { requestExport, requestImport } from "@services/figmaMessages";
import type { ActiveProposal, PluginSettings } from "../types";

export interface CollisionNotice {
  message: string;
  paths: string[];
  resolution: "designer" | "engineer";
  fixInstructions?: string;
}

export interface FigmaDiffResult {
  diffs: DiffItem[];
  figmaContent: string;
  collisionNotice: CollisionNotice | null;
  primaryModeName: string;
}

// The diff base — main, or an active PR's branch if one is selected.
export function resolveDiffSettings(
  settings: Omit<PluginSettings, "pat">,
  activeProposal: ActiveProposal | null
): Omit<PluginSettings, "pat"> {
  return activeProposal ? { ...settings, branch: activeProposal.head_ref } : settings;
}

export async function checkFigmaChanges(
  gitContent: string,
  diffSettings: Omit<PluginSettings, "pat">
): Promise<FigmaDiffResult> {
  let figmaContent: string;
  try {
    figmaContent = await requestExport();
  } catch (e) {
    if (e instanceof NamingCollisionError) {
      return {
        diffs: [],
        figmaContent: "",
        primaryModeName: "Default",
        collisionNotice: {
          message: e.message,
          paths: e.collidingPaths,
          resolution: "designer",
        },
      };
    }
    throw e;
  }

  const { diffs, quarantined, primaryModeName } = computeDiff(figmaContent, gitContent, "proposals");
  const collisionNotice: CollisionNotice | null =
    quarantined.length > 0
      ? {
          message: `The repository's token file has ${quarantined.length} token group(s) that are invalid — a token name is also used as a group name (e.g. "Primary" and "Primary/Hover"), which isn't allowed. This isn't fixable from Figma; an engineer needs to edit the token file directly to remove the conflict.`,
          paths: quarantined,
          resolution: "engineer",
          fixInstructions:
            `Each path below has both a "$value" and at least one non-"$"-prefixed child key at the same level in ${diffSettings.filePath} (branch: ${diffSettings.branch}) — invalid per the W3C DTCG spec, since a token can't also be a group.\n` +
            `To fix: either (a) move the child key(s) out to be a sibling of the token instead of nested under it, or (b) nest the token's own value under a new child key (e.g. rename the "$value" holder from "Primary" to "Primary/Default") so the parent becomes a pure group.\n` +
            `After editing, re-import the file in the plugin to confirm it parses cleanly with no quarantined paths.`,
        }
      : null;

  return { diffs, figmaContent, collisionNotice, primaryModeName };
}

// Writes gitContent into Figma's local variables wholesale, then re-diffs to confirm the result.
export async function resetFigmaToGit(
  gitContent: string,
  diffSettings: Omit<PluginSettings, "pat">
): Promise<FigmaDiffResult> {
  const result = await requestImport(gitContent);
  if (!result.success) {
    throw new Error(result.message);
  }
  return checkFigmaChanges(gitContent, diffSettings);
}

// Never overrides the designer's local changes — fetches its own fresh export rather than
// trusting a caller-supplied diffs array, which could be stale.
export async function computeSafeSubset(oldGitContent: string, newGitContent: string): Promise<Set<string>> {
  const figmaContent = await requestExport();
  const { diffs: drift } = computeDiff(figmaContent, oldGitContent, "proposals");
  const drifted = new Set(drift.map((d) => d.dotPath));

  const { diffs: delta } = computeDiff(newGitContent, oldGitContent, "proposals");
  const safe = new Set<string>();
  for (const d of delta) {
    if (d.type === "deleted") continue;
    if (drifted.has(d.dotPath)) continue;
    safe.add(d.dotPath);
  }
  return safe;
}

export async function applySafeSubset(
  newGitContent: string,
  safeDotPaths: Set<string>,
  diffSettings: Omit<PluginSettings, "pat">
): Promise<FigmaDiffResult> {
  if (safeDotPaths.size > 0) {
    const figmaContent = await requestExport();
    const merged = applySafeDiffsToFigmaJson(figmaContent, newGitContent, safeDotPaths);
    const result = await requestImport(merged);
    if (!result.success) {
      throw new Error(result.message);
    }
  }
  return checkFigmaChanges(newGitContent, diffSettings);
}
