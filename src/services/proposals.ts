import { applyStagedDiffs } from "@common/applyStagedDiffs";
import { type DiffItem } from "@common/diff";
import { GitHubService, PROPOSAL_BRANCH_PREFIX } from "@services/github";
import { checkFigmaChanges, resolveDiffSettings, type CollisionNotice } from "@services/gitSync";
import { parsePrLabels, type ActiveProposal, type PluginSettings } from "../types";

export interface Proposal {
  number: number;
  title: string;
  state: string;
  html_url: string;
  head_ref: string;
}

export interface ProposalCheckResult {
  diffs: DiffItem[];
  figmaContent: string;
  gitContent: string;
  proposals: Proposal[];
  collisionNotice: CollisionNotice | null;
  primaryModeName: string;
}

export async function checkForProposalChanges(
  settings: Omit<PluginSettings, "pat">,
  github: GitHubService,
  activeProposal: ActiveProposal | null
): Promise<ProposalCheckResult> {
  const diffSettings = resolveDiffSettings(settings, activeProposal);
  const fileData = await github.getFile(diffSettings);
  const gitContent = fileData?.content ?? "{}";

  const { diffs, figmaContent, collisionNotice, primaryModeName } = await checkFigmaChanges(gitContent, diffSettings);
  const proposals = await github.listPullRequests(settings.owner, settings.repo, settings.branch);
  return { diffs, figmaContent, gitContent, proposals, collisionNotice, primaryModeName };
}

export async function submitProposal(
  settings: Omit<PluginSettings, "pat">,
  github: GitHubService,
  figmaContent: string,
  diffs: DiffItem[],
  description: string,
  activeProposal: ActiveProposal | null
): Promise<{ number: number; html_url: string; head_ref: string; gitContent: string }> {
  const stagedDotPaths = new Set(diffs.map((d) => d.dotPath));

  if (activeProposal) {
    const freshBranchFile = await github.getFile({ ...settings, branch: activeProposal.head_ref });
    if (!freshBranchFile) {
      throw new Error("This PR's branch is no longer available — it may have been merged or closed.");
    }
    const mergedContent = applyStagedDiffs(freshBranchFile.content, figmaContent, stagedDotPaths);
    await github.updateFile(settings, description, mergedContent, freshBranchFile.sha, activeProposal.head_ref);
    return {
      number: activeProposal.number,
      html_url: activeProposal.html_url,
      head_ref: activeProposal.head_ref,
      gitContent: mergedContent,
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
  return { ...pr, head_ref: branchName, gitContent: mergedContent };
}
