import { applyStagedDiffs } from "@common/applyStagedDiffs";
import { computeDiff, type DiffItem } from "@common/diff";
import { GitHubService, PROPOSAL_BRANCH_PREFIX } from "@services/github";
import {
  applySafeSubset,
  checkFigmaChanges,
  computeSafeSubset,
  resolveDiffSettings,
  type CollisionNotice,
  type FigmaDiffResult,
  type ResetNotice,
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
  resetNotice: ResetNotice | null;
  primaryModeName: string;
}

export async function checkForProposalChanges(
  settings: Omit<PluginSettings, "pat">,
  github: GitHubService,
  activeProposal: ActiveProposal | null,
  knownProposals?: Proposal[]
): Promise<ProposalCheckResult> {
  const diffSettings = resolveDiffSettings(settings, activeProposal);
  const fileData = await github.getFile(diffSettings);
  const gitContent = fileData?.content ?? "{}";

  const { diffs, figmaContent, collisionNotice, resetNotice, primaryModeName } = await checkFigmaChanges(gitContent, diffSettings);
  const proposals = knownProposals ?? (await github.listPullRequests(settings.owner, settings.repo, settings.branch));
  return { diffs, figmaContent, gitContent, proposals, collisionNotice, resetNotice, primaryModeName };
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
  const safeDotPaths = await computeSafeSubset(staleResult.gitContent, newGitContent);
  const refreshed = await applySafeSubset(newGitContent, safeDotPaths, settings);
  return { refreshed, gitContent: newGitContent, count: safeDotPaths.size };
}

export interface ResolvedDeadProposal {
  number: number;
  reason: "merged" | "closed";
  count: number;
}

export interface ProposalStaleness {
  count: number;
}

// Content-diff based, not commit-count based — main moves constantly for reasons unrelated to
// tokens, so counting commits would nag on unrelated activity.
export async function checkProposalStaleness(
  settings: Omit<PluginSettings, "pat">,
  github: GitHubService,
  activeProposal: ActiveProposal
): Promise<ProposalStaleness | null> {
  const mergeBaseSha = await github.getMergeBaseSha(
    settings.owner,
    settings.repo,
    activeProposal.head_ref,
    settings.branch
  );
  const [mergeBaseFile, mainFile] = await Promise.all([
    github.getFile({ ...settings, branch: mergeBaseSha }),
    github.getFile(settings),
  ]);
  const mergeBaseContent = mergeBaseFile?.content ?? "{}";
  const mainContent = mainFile?.content ?? "{}";
  if (mainContent === mergeBaseContent) return null;

  // Diffed against the fork point, not the branch's own current content — the branch's own
  // proposed changes always differ from main by definition and must not count as staleness.
  const { diffs } = computeDiff(mainContent, mergeBaseContent, "proposals");
  return diffs.length > 0 ? { count: diffs.length } : null;
}

// Handles the diff target moving for reasons unrelated to a discretionary switch (a push to
// main, a commit on the PR branch) — same safe-subset rule as everywhere else.
async function applyIdleDrift(
  settings: Omit<PluginSettings, "pat">,
  result: ProposalCheckResult,
  lastGoodResult: ProposalCheckResult | null,
  activeProposal: ActiveProposal | null
): Promise<{ result: ProposalCheckResult; syncedCount: number }> {
  if (!lastGoodResult || result.gitContent === lastGoodResult.gitContent) {
    return { result, syncedCount: 0 };
  }

  const safeDotPaths = await computeSafeSubset(lastGoodResult.gitContent, result.gitContent);
  if (safeDotPaths.size === 0) {
    return { result, syncedCount: 0 };
  }

  const refreshed = await applySafeSubset(result.gitContent, safeDotPaths, resolveDiffSettings(settings, activeProposal));
  return {
    result: { ...refreshed, gitContent: result.gitContent, proposals: result.proposals },
    syncedCount: safeDotPaths.size,
  };
}

// Is the active proposal still open? If not, resolve it and report what happened.
// lastGoodResult (the previous successful check, if any) stands in for a fresh
// checkForProposalChanges call so the fallback doesn't merge onto a diff computed against the
// now-dead branch.
export async function checkActiveProposalStatus(
  settings: Omit<PluginSettings, "pat">,
  github: GitHubService,
  activeProposal: ActiveProposal | null,
  lastGoodResult: ProposalCheckResult | null
): Promise<{
  result: ProposalCheckResult;
  resolvedDeadProposal: ResolvedDeadProposal | null;
  staleness: ProposalStaleness | null;
  syncedCount: number;
}> {
  const listedProposals = await github.listPullRequests(settings.owner, settings.repo, settings.branch);

  if (activeProposal) {
    let proposals = listedProposals;
    let match = proposals.find((p) => p.number === activeProposal.number);

    // GitHub's PR-list endpoint can briefly lag behind a PR we just created or switched to
    // ourselves — confirm against the single-PR endpoint before ever declaring it dead, so that
    // lag doesn't get misread as "merged or closed" and knock the designer back to their base
    // branch on their own just-created PR.
    if (!match || match.state !== "open") {
      const confirmed = await github.getPullRequest(settings.owner, settings.repo, activeProposal.number);
      if (confirmed.state === "open") {
        match = { ...activeProposal, state: "open" };
        proposals = [match, ...proposals.filter((p) => p.number !== activeProposal.number)];
      }
    }

    if (!match || match.state !== "open") {
      const staleResult = lastGoodResult ?? (await checkForProposalChanges(settings, github, activeProposal, proposals));
      const { refreshed, gitContent, count } = await resolveDeadProposal(settings, github, staleResult);
      return {
        result: { ...refreshed, gitContent, proposals },
        resolvedDeadProposal: {
          number: activeProposal.number,
          reason: match?.state === "merged" ? "merged" : "closed",
          count,
        },
        staleness: null,
        syncedCount: 0,
      };
    }

    const rawResult = await checkForProposalChanges(settings, github, activeProposal, proposals);
    const { result, syncedCount } = await applyIdleDrift(settings, rawResult, lastGoodResult, activeProposal);
    return {
      result,
      resolvedDeadProposal: null,
      staleness: await checkProposalStaleness(settings, github, activeProposal),
      syncedCount,
    };
  }

  const rawResult = await checkForProposalChanges(settings, github, activeProposal, listedProposals);
  const { result, syncedCount } = await applyIdleDrift(settings, rawResult, lastGoodResult, null);
  return { result, resolvedDeadProposal: null, staleness: null, syncedCount };
}

export type UpdateBranchResult =
  | { status: "updated"; count: number; gitContent: string; refreshed: FigmaDiffResult }
  | { status: "conflict"; detail: string };

// Reuses the same safe-subset mechanism a discretionary diff-base switch already uses.
export async function updateProposalBranch(
  settings: Omit<PluginSettings, "pat">,
  github: GitHubService,
  activeProposal: ActiveProposal,
  current: ProposalCheckResult
): Promise<UpdateBranchResult> {
  try {
    await github.updateBranch(settings.owner, settings.repo, activeProposal.number);
  } catch (e: any) {
    // GitHub can reject this synchronously (422) for a real conflict instead of returning 202
    // and only revealing it later via mergeable_state — same conflict, just detected earlier.
    if (e?.status === 422) {
      return { status: "conflict", detail: e.message ?? "GitHub rejected the merge as a conflict." };
    }
    throw e;
  }

  const pr = await waitForMergeResolution(github, settings.owner, settings.repo, activeProposal.number);

  if (pr.mergeable_state === "dirty") {
    return { status: "conflict", detail: `GitHub could not merge ${settings.branch} into this branch automatically.` };
  }

  const branchFile = await github.getFile({ ...settings, branch: activeProposal.head_ref });
  const newGitContent = branchFile?.content ?? "{}";
  const safeDotPaths = await computeSafeSubset(current.gitContent, newGitContent);
  const refreshed = await applySafeSubset(newGitContent, safeDotPaths, resolveDiffSettings(settings, activeProposal));
  return { status: "updated", count: safeDotPaths.size, gitContent: newGitContent, refreshed };
}

const MERGE_POLL_INTERVAL_MS = 2_000;
const MERGE_POLL_MAX_ATTEMPTS = 8;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForMergeResolution(
  github: GitHubService,
  owner: string,
  repo: string,
  pullNumber: number
): Promise<{ mergeable: boolean | null; mergeable_state: string }> {
  for (let attempt = 0; attempt < MERGE_POLL_MAX_ATTEMPTS; attempt++) {
    const pr = await github.getPullRequest(owner, repo, pullNumber);
    if (pr.mergeable_state !== "unknown") return pr;
    await sleep(MERGE_POLL_INTERVAL_MS);
  }
  throw new Error("GitHub is still finalizing this merge — it'll sync automatically once it's done.");
}

export async function abandonProposal(
  settings: Omit<PluginSettings, "pat">,
  github: GitHubService,
  activeProposal: ActiveProposal,
  current: ProposalCheckResult
): Promise<{ refreshed: FigmaDiffResult; gitContent: string; count: number }> {
  await github.closePullRequest(settings.owner, settings.repo, activeProposal.number);
  await github.deleteBranch(settings.owner, settings.repo, activeProposal.head_ref);
  return resolveDeadProposal(settings, github, current);
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
