import { applyStagedDiffs } from "@common/applyStagedDiffs";
import { computeDiff, type DiffItem } from "@common/diff";
import { NamingCollisionError } from "@common/dtcg";
import { requestExport } from "@services/figmaMessages";
import { GitHubService, PROPOSAL_BRANCH_PREFIX } from "@services/github";
import { parsePrLabels, type PluginSettings } from "../types";

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
  proposals: Proposal[];
  collisionNotice: CollisionNotice | null;
}

export async function checkForProposalChanges(
  settings: Omit<PluginSettings, "pat">,
  github: GitHubService
): Promise<ProposalCheckResult> {
  const fileData = await github.getFile(settings);
  const gitContent = fileData?.content ?? "{}";

  let figmaContent: string;
  try {
    figmaContent = await requestExport();
  } catch (e) {
    if (e instanceof NamingCollisionError) {
      return {
        diffs: [],
        figmaContent: "",
        proposals: [],
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
            `Each path below has both a "$value" and at least one non-"$"-prefixed child key at the same level in ${settings.filePath} (branch: ${settings.branch}) — invalid per the W3C DTCG spec, since a token can't also be a group.\n` +
            `To fix: either (a) move the child key(s) out to be a sibling of the token instead of nested under it, or (b) nest the token's own value under a new child key (e.g. rename the "$value" holder from "Primary" to "Primary/Default") so the parent becomes a pure group.\n` +
            `After editing, re-import the file in the plugin to confirm it parses cleanly with no quarantined paths.`,
        }
      : null;

  const proposals = await github.listPullRequests(settings.owner, settings.repo, settings.branch);
  return { diffs, figmaContent, proposals, collisionNotice };
}

export async function submitProposal(
  settings: Omit<PluginSettings, "pat">,
  github: GitHubService,
  figmaContent: string,
  diffs: DiffItem[],
  description: string
): Promise<{ number: number; html_url: string }> {
  const stagedDotPaths = new Set(diffs.map((d) => d.dotPath));

  const branchName = `${PROPOSAL_BRANCH_PREFIX}${Date.now()}`;
  await github.createBranch(settings, branchName);

  const fileData = await github.getFile(settings);
  const baseJson = fileData?.content ?? "{}";
  const mergedContent = applyStagedDiffs(baseJson, figmaContent, stagedDotPaths);

  await github.updateFile(settings, description, mergedContent, fileData?.sha, branchName);

  return github.createPullRequest(
    settings,
    description,
    `Design variable changes exported from Figma.\n\n${description}`,
    branchName,
    parsePrLabels(settings.prLabels)
  );
}
