import { applyStagedDiffs } from "@common/applyStagedDiffs";
import { computeDiff, type DiffItem } from "@common/diff";
import { NamingCollisionError } from "@common/dtcg";
import { requestExport } from "@services/figmaMessages";
import { GitHubService, PROPOSAL_BRANCH_PREFIX } from "@services/github";
import { parsePrLabels, type ActiveProposal, type PluginSettings } from "../types";

export interface Proposal {
  number: number;
  title: string;
  state: string;
  html_url: string;
  head_ref: string;
}

export interface CollisionNotice {
  message: string;
  paths: string[];
  resolution: "designer" | "engineer";
  fixInstructions?: string;
}

export interface ProposalCheckResult {
  diffs: DiffItem[];
  figmaContent: string;
  gitContent: string;
  proposals: Proposal[];
  collisionNotice: CollisionNotice | null;
}

export interface FigmaDiffResult {
  diffs: DiffItem[];
  figmaContent: string;
  collisionNotice: CollisionNotice | null;
}

// The diff base — main, or an active PR's branch if one is selected — determines both what
// gitContent means below and where a collision fix would need to be made.
export function resolveDiffSettings(
  settings: Omit<PluginSettings, "pat">,
  activeProposal: ActiveProposal | null
): Omit<PluginSettings, "pat"> {
  return activeProposal ? { ...settings, branch: activeProposal.head_ref } : settings;
}

// Re-diffs Figma's current export against an already-fetched git baseline, with no GitHub calls
// of its own — cheap enough to poll every few seconds so a designer sees their own edits reflected
// almost instantly, independent of how often the (rate-limited, GitHub-API-backed) git-side state
// is refreshed.
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
        collisionNotice: {
          message: e.message,
          paths: e.collidingPaths,
          resolution: "designer",
        },
      };
    }
    throw e;
  }

  const { diffs, quarantined } = computeDiff(figmaContent, gitContent, "proposals");
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

  return { diffs, figmaContent, collisionNotice };
}

export async function checkForProposalChanges(
  settings: Omit<PluginSettings, "pat">,
  github: GitHubService,
  activeProposal: ActiveProposal | null
): Promise<ProposalCheckResult> {
  const diffSettings = resolveDiffSettings(settings, activeProposal);
  const fileData = await github.getFile(diffSettings);
  const gitContent = fileData?.content ?? "{}";

  const { diffs, figmaContent, collisionNotice } = await checkFigmaChanges(gitContent, diffSettings);
  const proposals = await github.listPullRequests(settings.owner, settings.repo, settings.branch);
  return { diffs, figmaContent, gitContent, proposals, collisionNotice };
}

export async function submitProposal(
  settings: Omit<PluginSettings, "pat">,
  github: GitHubService,
  figmaContent: string,
  diffs: DiffItem[],
  description: string,
  activeProposal: ActiveProposal | null
): Promise<{ number: number; html_url: string; head_ref: string }> {
  const stagedDotPaths = new Set(diffs.map((d) => d.dotPath));

  if (activeProposal) {
    // fileData must come from the PR's own branch, not settings.branch (main) — reusing main's
    // sha here would either 409 once the branch has diverged, or succeed by coincidence and only
    // break on the PR's *next* push.
    const fileData = await github.getFile({ ...settings, branch: activeProposal.head_ref });
    if (!fileData) {
      throw new Error("This PR's branch is no longer available — it may have been merged or closed.");
    }
    const mergedContent = applyStagedDiffs(fileData.content, figmaContent, stagedDotPaths);
    await github.updateFile(settings, description, mergedContent, fileData.sha, activeProposal.head_ref);
    return {
      number: activeProposal.number,
      html_url: activeProposal.html_url,
      head_ref: activeProposal.head_ref,
    };
  }

  const branchName = `${PROPOSAL_BRANCH_PREFIX}${Date.now()}`;
  await github.createBranch(settings, branchName);

  const fileData = await github.getFile(settings);
  const baseJson = fileData?.content ?? "{}";
  const mergedContent = applyStagedDiffs(baseJson, figmaContent, stagedDotPaths);

  await github.updateFile(settings, description, mergedContent, fileData?.sha, branchName);

  const pr = await github.createPullRequest(
    settings,
    description,
    `Design variable changes exported from Figma.\n\n${description}`,
    branchName,
    parsePrLabels(settings.prLabels)
  );
  return { ...pr, head_ref: branchName };
}
