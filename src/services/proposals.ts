import { applyStagedDiffs } from "@common/applyStagedDiffs";
import { computeDiff, type DiffItem } from "@common/diff";
import { GitHubService, PROPOSAL_BRANCH_PREFIX } from "@services/github";
import {
  checkFigmaChanges,
  computeSafeSubset,
  resolveDiffSettings,
  type CollisionNotice,
  type FigmaDiffResult,
  type ResetNotice,
  type SafeSyncPlan,
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
  // The git blob sha this gitContent was read at (undefined for results that never read
  // straight off a branch — e.g. dead-proposal/merge fallbacks). Lets a caller tell a
  // lagging Contents API read apart from a genuinely new change.
  gitSha?: string | null;
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
  return { diffs, figmaContent, gitContent, gitSha: fileData?.sha ?? null, proposals, collisionNotice, resetNotice, primaryModeName };
}

// Called once a designer's active PR is found to be merged/closed — falls back to main,
// planning whatever of the pending diffs is safe to sync (see computeSafeSubset), left
// uncommitted for the caller to auto-apply or hold for confirmation.
export async function planResolveDeadProposal(
  settings: Omit<PluginSettings, "pat">,
  github: GitHubService,
  staleResult: ProposalCheckResult
): Promise<{ plan: SafeSyncPlan; pending: FigmaDiffResult }> {
  const mainFile = await github.getFile(settings);
  const newGitContent = mainFile?.content ?? "{}";
  const [safeDotPaths, pending] = await Promise.all([
    computeSafeSubset(staleResult.gitContent, newGitContent),
    checkFigmaChanges(newGitContent, settings),
  ]);
  return { plan: { newGitContent, safeDotPaths, diffSettings: settings }, pending };
}

export interface ResolvedDeadProposal {
  number: number;
  reason: "merged" | "closed";
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
// main, a commit on the PR branch) — same safe-subset rule as everywhere else, left uncommitted.
async function planIdleDrift(
  settings: Omit<PluginSettings, "pat">,
  result: ProposalCheckResult,
  lastGoodResult: ProposalCheckResult | null,
  activeProposal: ActiveProposal | null
): Promise<SafeSyncPlan> {
  const diffSettings = resolveDiffSettings(settings, activeProposal);
  if (!lastGoodResult || result.gitContent === lastGoodResult.gitContent) {
    return { newGitContent: result.gitContent, safeDotPaths: new Set(), diffSettings };
  }

  const safeDotPaths = await computeSafeSubset(lastGoodResult.gitContent, result.gitContent);
  return { newGitContent: result.gitContent, safeDotPaths, diffSettings };
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
  plan: SafeSyncPlan;
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
      const { plan, pending } = await planResolveDeadProposal(settings, github, staleResult);
      return {
        result: { ...pending, gitContent: plan.newGitContent, proposals },
        resolvedDeadProposal: {
          number: activeProposal.number,
          reason: match?.state === "merged" ? "merged" : "closed",
        },
        staleness: null,
        plan,
      };
    }

    const rawResult = await checkForProposalChanges(settings, github, activeProposal, proposals);
    const plan = await planIdleDrift(settings, rawResult, lastGoodResult, activeProposal);
    return {
      result: rawResult,
      resolvedDeadProposal: null,
      staleness: await checkProposalStaleness(settings, github, activeProposal),
      plan,
    };
  }

  const rawResult = await checkForProposalChanges(settings, github, activeProposal, listedProposals);
  const plan = await planIdleDrift(settings, rawResult, lastGoodResult, null);
  return { result: rawResult, resolvedDeadProposal: null, staleness: null, plan };
}

export type UpdateBranchResult =
  | { status: "updated"; plan: SafeSyncPlan; pending: FigmaDiffResult }
  | { status: "conflict"; detail: string };

// Reuses the same safe-subset mechanism a discretionary diff-base switch already uses. The
// branch merge itself (a git-side action, not a variable mutation) always happens; only the
// resulting sync into Figma is left uncommitted for the caller to auto-apply or hold.
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
  const diffSettings = resolveDiffSettings(settings, activeProposal);
  const [safeDotPaths, pending] = await Promise.all([
    computeSafeSubset(current.gitContent, newGitContent),
    checkFigmaChanges(newGitContent, diffSettings),
  ]);
  return { status: "updated", plan: { newGitContent, safeDotPaths, diffSettings }, pending };
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
): Promise<{ plan: SafeSyncPlan; pending: FigmaDiffResult }> {
  await github.closePullRequest(settings.owner, settings.repo, activeProposal.number);
  await github.deleteBranch(settings.owner, settings.repo, activeProposal.head_ref);
  return planResolveDeadProposal(settings, github, current);
}

export interface SubmitProposalResult {
  number: number;
  html_url: string;
  head_ref: string;
  gitContent: string;
  // The sha of the content this write replaced, and the sha it wrote. A read that still
  // reports previousGitSha shortly after this resolves means the Contents API hasn't caught
  // up yet — not a real subsequent change — see refreshActiveProposal's staleness guard.
  previousGitSha: string | null;
  gitSha: string;
}

export async function submitProposal(
  settings: Omit<PluginSettings, "pat">,
  github: GitHubService,
  figmaContent: string,
  diffs: DiffItem[],
  description: string,
  activeProposal: ActiveProposal | null
): Promise<SubmitProposalResult> {
  const stagedDotPaths = new Set(diffs.map((d) => d.dotPath));

  if (activeProposal) {
    const freshBranchFile = await github.getFile({ ...settings, branch: activeProposal.head_ref });
    if (!freshBranchFile) {
      throw new Error("This PR's branch is no longer available — it may have been merged or closed.");
    }
    const mergedContent = applyStagedDiffs(freshBranchFile.content, figmaContent, stagedDotPaths);
    const gitSha = await github.updateFile(settings, description, mergedContent, freshBranchFile.sha, activeProposal.head_ref);
    return {
      number: activeProposal.number,
      html_url: activeProposal.html_url,
      head_ref: activeProposal.head_ref,
      gitContent: mergedContent,
      previousGitSha: freshBranchFile.sha,
      gitSha,
    };
  }

  const branchName = `${PROPOSAL_BRANCH_PREFIX}${Date.now()}`;
  await github.createBranch(settings, branchName);

  const fileData = await github.getFile(settings);
  const baseJson = fileData?.content ?? "{}";
  const mergedContent = applyStagedDiffs(baseJson, figmaContent, stagedDotPaths);

  const gitSha = await github.updateFile(settings, description, mergedContent, fileData?.sha, branchName);

  const pr = await github.createPullRequest(
    settings,
    description,
    `Design variable changes exported from Figma.\n\n${description}`,
    branchName,
    parsePrLabels(settings.prLabels)
  );
  return { ...pr, head_ref: branchName, gitContent: mergedContent, previousGitSha: fileData?.sha ?? null, gitSha };
}
