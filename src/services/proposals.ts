import { applyStagedDiffs } from "@common/applyStagedDiffs";
import { type DiffItem } from "@common/diff";
import { GitHubService, PROPOSAL_BRANCH_PREFIX } from "@services/github";
import {
  applySafeSubset,
  checkFigmaChanges,
  computeSafeSubset,
  resolveDiffSettings,
  type CollisionNotice,
  type FigmaDiffResult,
} from "@services/gitSync";
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

// Called once a designer's active PR is found to be merged/closed — falls back to main,
// applying whatever of the pending diffs is safe to sync automatically (see computeSafeSubset).
export async function resolveDeadProposal(
  settings: Omit<PluginSettings, "pat">,
  github: GitHubService,
  staleResult: ProposalCheckResult
): Promise<{ refreshed: FigmaDiffResult; gitContent: string; count: number }> {
  const mainFile = await github.getFile(settings);
  const newGitContent = mainFile?.content ?? "{}";
  const safeDotPaths = computeSafeSubset(staleResult.gitContent, newGitContent, staleResult.diffs);
  const refreshed = await applySafeSubset(newGitContent, safeDotPaths, settings);
  return { refreshed, gitContent: newGitContent, count: safeDotPaths.size };
}

export interface ResolvedDeadProposal {
  number: number;
  reason: "merged" | "closed";
  count: number;
}

// The 3a decision: is the active proposal still open? If not, resolve it and report what
// happened; otherwise this is just an ordinary check. lastGoodResult (the previous successful
// check, if any) stands in for a fresh checkForProposalChanges call so the fallback doesn't
// merge onto a diff computed against the now-dead branch.
export async function checkActiveProposalStatus(
  settings: Omit<PluginSettings, "pat">,
  github: GitHubService,
  activeProposal: ActiveProposal | null,
  lastGoodResult: ProposalCheckResult | null
): Promise<{ result: ProposalCheckResult; resolvedDeadProposal: ResolvedDeadProposal | null }> {
  if (activeProposal) {
    const proposals = await github.listPullRequests(settings.owner, settings.repo, settings.branch);
    const match = proposals.find((p) => p.number === activeProposal.number);
    if (!match || match.state !== "open") {
      const staleResult = lastGoodResult ?? (await checkForProposalChanges(settings, github, activeProposal));
      const { refreshed, gitContent, count } = await resolveDeadProposal(settings, github, staleResult);
      return {
        result: { ...refreshed, gitContent, proposals },
        resolvedDeadProposal: {
          number: activeProposal.number,
          reason: match?.state === "merged" ? "merged" : "closed",
          count,
        },
      };
    }
  }

  return { result: await checkForProposalChanges(settings, github, activeProposal), resolvedDeadProposal: null };
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
