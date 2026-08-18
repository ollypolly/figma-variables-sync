import { atom, computed, type WritableAtom } from "nanostores";

import { GitHubService } from "@services/github";
import { describeGitHubError } from "@services/githubErrors";
import { requestExport } from "@services/figmaMessages";
import {
  applySafeSubset,
  checkFigmaChanges,
  computeSafeSubset,
  resetFigmaToGit,
  resolveDiffSettings,
  type FigmaDiffResult,
  type SafeSyncPlan,
} from "@services/gitSync";
import {
  abandonProposal as requestAbandonProposal,
  checkActiveProposalStatus,
  submitProposal as requestSubmitProposal,
  updateProposalBranch,
  type ProposalCheckResult,
  type ProposalStaleness,
} from "@services/proposals";
import type {
  ActiveProposal,
  DraftDescriptionLoadedHandler,
  LoadDraftDescriptionHandler,
  PluginSettings,
  SaveDraftDescriptionHandler,
} from "../types";
import { $activeProposal } from "./activeProposalStore";
import { figmaPersistedAtom } from "./figmaPersistedAtom";
import { $settings } from "./settingsStore";

const FAST_POLL_INTERVAL_MS = 3_000;
const SLOW_POLL_INTERVAL_MS = 30_000;

interface PendingSync {
  targetLabel: string;
  count: number;
  commit: () => Promise<void>;
}

interface ConflictNotice {
  number: number;
  head_ref: string;
  html_url: string;
  detail: string;
  fixInstructions: string;
}

interface SubmitResult {
  number: number;
  html_url: string;
  head_ref: string;
  gitContent: string;
  wasUpdate: boolean;
}

const { store: $description } = figmaPersistedAtom<
  string,
  LoadDraftDescriptionHandler,
  DraftDescriptionLoadedHandler,
  SaveDraftDescriptionHandler
>("", "LOAD_DRAFT_DESCRIPTION", "DRAFT_DESCRIPTION_LOADED", "SAVE_DRAFT_DESCRIPTION");

export { $description };

export const $check = atom<ProposalCheckResult | null>(null);
export const $checking = atom(false);
// Set by any failed attempt to confirm changes against GitHub — the initial/manual check or a
// poll tick alike — and cleared by the next one that succeeds. One atom, not two, so a poll
// succeeding doesn't leave a stale error from the check (or vice versa) stuck on screen.
export const $connectionError = atom<string | null>(null);

export const $background = atom<{ success: boolean; text: string } | null>(null);
export const $pendingSync = atom<PendingSync | null>(null);
export const $switchLoading = atom(false);

export const $staleness = atom<ProposalStaleness | null>(null);
export const $dismissedStalenessCount = atom(0);
export const $dismissedResetNoticePaths = atom<string[]>([]);
export const $conflictNotice = atom<ConflictNotice | null>(null);
export const $mergingBranch = atom(false);

export const $submitting = atom(false);
export const $submitError = atom<string | null>(null);
const $submitResult = atom<SubmitResult | null>(null);

export const $resetting = atom(false);
export const $resetError = atom<string | null>(null);
const $resetResult = atom<FigmaDiffResult | null>(null);

export const $exportPreviewJson = atom<string | null>(null);
export const $exportPreviewLoading = atom(false);
export const $exportPreviewError = atom<string | null>(null);

export const $openProposals = computed($check, (check) =>
  (check?.proposals ?? []).filter((p) => p.state === "open")
);

export const $showStalenessNotice = computed(
  [$staleness, $dismissedStalenessCount, $conflictNotice],
  (staleness, dismissedCount, conflictNotice) =>
    staleness !== null && staleness.count > dismissedCount && !conflictNotice
);

export const $showResetNotice = computed(
  [$check, $dismissedResetNoticePaths],
  (check, dismissedPaths) => {
    const paths = check?.resetNotice?.paths ?? [];
    return paths.length > 0 && paths.some((p) => !dismissedPaths.includes(p));
  }
);

export const $status = computed(
  [$background, $resetError, $resetResult, $submitError, $submitResult, $connectionError],
  (background, resetError, resetResult, submitError, submitResult, connectionError) => {
    if (background) return background;
    if (resetError) return { success: false, text: resetError };
    if (resetResult) return { success: true, text: "Figma reset to match git." };
    if (submitError) return { success: false, text: submitError };
    if (submitResult) {
      return {
        success: true,
        text: submitResult.wasUpdate
          ? `Pushed to PR #${submitResult.number}.`
          : `PR #${submitResult.number} created.`,
        link: submitResult.html_url,
      };
    }
    if (connectionError) return { success: false, text: connectionError };
    return null;
  }
);

function resetStaleness(): void {
  $staleness.set(null);
  $dismissedStalenessCount.set(0);
  $conflictNotice.set(null);
}

function getGitHub(settings: PluginSettings): GitHubService | null {
  if (!settings.pat) return null;
  return new GitHubService(settings.pat);
}

function setDataIfChanged<T>(store: WritableAtom<T | null>, next: T): void {
  const prev = store.get();
  if (prev && JSON.stringify(prev) === JSON.stringify(next)) return;
  store.set(next);
}

// The single gate every Figma-mutating sync path runs through: nothing to sync never shows a
// dialog, skipSwitchConfirmation always auto-applies, and otherwise the plan waits in
// $pendingSync for the designer to confirm via SyncConfirmDialog.
async function resolvePendingSync(
  plan: SafeSyncPlan,
  targetLabel: string,
  onCommitted: (refreshed: FigmaDiffResult) => void,
  onError: (e: unknown) => void
): Promise<void> {
  const commit = async () => {
    try {
      const refreshed = await applySafeSubset(plan.newGitContent, plan.safeDotPaths, plan.diffSettings);
      onCommitted(refreshed);
      $pendingSync.set(null);
    } catch (e) {
      onError(e);
    }
  };

  if ($settings.get().skipSwitchConfirmation || plan.safeDotPaths.size === 0) {
    await commit();
    return;
  }

  $pendingSync.set({ targetLabel, count: plan.safeDotPaths.size, commit });
}

interface ActiveProposalRefresh {
  result: ProposalCheckResult;
  // Set when GitHub couldn't be reached to confirm the git side, but we could still show local
  // Figma changes against the last confirmed git baseline. The result is real but unverified —
  // proposals/staleness/pending-sync data is whatever was last confirmed, not refreshed this cycle.
  error: string | null;
}

async function refreshActiveProposal(): Promise<ActiveProposalRefresh> {
  const settings = $settings.get();
  const github = getGitHub(settings);
  if (!github) throw new Error("Not configured.");
  const activeProposal = $activeProposal.get();
  const lastGoodResult = $check.get();

  let statusCheck: Awaited<ReturnType<typeof checkActiveProposalStatus>>;
  try {
    statusCheck = await checkActiveProposalStatus(settings, github, activeProposal, lastGoodResult);
  } catch (e) {
    if (!lastGoodResult) throw e;
    const diffSettings = resolveDiffSettings(settings, activeProposal);
    const localRefresh = await checkFigmaChanges(lastGoodResult.gitContent, diffSettings);
    return {
      result: { ...lastGoodResult, ...localRefresh },
      error: describeGitHubError(e, { owner: settings.owner, repo: settings.repo, fallback: "Couldn't confirm changes against GitHub." }),
    };
  }

  const { result, resolvedDeadProposal, staleness: nextStaleness, plan } = statusCheck;

  if (resolvedDeadProposal) {
    $activeProposal.set(null);
    resetStaleness();
    $background.set({
      success: true,
      text: `PR #${resolvedDeadProposal.number} was ${resolvedDeadProposal.reason} — you're back on ${settings.branch}.`,
    });
  } else {
    $staleness.set(nextStaleness);
    if (nextStaleness === null) {
      $conflictNotice.set(null);
    }
  }

  if (plan.safeDotPaths.size === 0) return { result, error: null };

  const targetLabel = resolvedDeadProposal ? settings.branch : activeProposal ? `PR #${activeProposal.number}` : settings.branch;
  let finalResult = result;
  await resolvePendingSync(
    plan,
    targetLabel,
    (refreshed) => {
      finalResult = { ...refreshed, gitContent: plan.newGitContent, proposals: result.proposals };
      $background.set({
        success: true,
        text: `${plan.safeDotPaths.size} variable${plan.safeDotPaths.size === 1 ? "" : "s"} updated to match ${targetLabel}.`,
      });
    },
    (e) =>
      $background.set({
        success: false,
        text: describeGitHubError(e, { owner: settings.owner, repo: settings.repo, fallback: "Failed to sync." }),
      })
  );
  return { result: finalResult, error: null };
}

export async function checkForChanges(): Promise<ProposalCheckResult | null> {
  $checking.set(true);
  try {
    const { result, error } = await refreshActiveProposal();
    $check.set(result);
    $checking.set(false);
    $connectionError.set(error);
    return result;
  } catch (e) {
    $checking.set(false);
    const { owner, repo } = $settings.get();
    $connectionError.set(describeGitHubError(e, { owner, repo, fallback: "An error occurred." }));
    $check.set(null);
    return null;
  }
}

export async function requestSwitch(target: ActiveProposal | null): Promise<void> {
  const settings = $settings.get();
  const github = getGitHub(settings);
  const current = $check.get();
  if (!github || !current) return;
  $background.set(null);
  const targetSettings = resolveDiffSettings(settings, target);

  $switchLoading.set(true);
  try {
    const file = await github.getFile(targetSettings);
    const newGitContent = file?.content ?? "{}";
    const safeDotPaths = await computeSafeSubset(current.gitContent, newGitContent);
    const plan: SafeSyncPlan = { newGitContent, safeDotPaths, diffSettings: targetSettings };

    await resolvePendingSync(
      plan,
      target ? `PR #${target.number}` : settings.branch,
      (refreshed) => {
        $activeProposal.set(target);
        resetStaleness();
        const prev = $check.get();
        $check.set({ ...refreshed, gitContent: newGitContent, proposals: prev?.proposals ?? [] });
      },
      (e) =>
        $background.set({
          success: false,
          text: describeGitHubError(e, { owner: settings.owner, repo: settings.repo, fallback: "Failed to switch." }),
        })
    );
  } catch (e) {
    $background.set({
      success: false,
      text: describeGitHubError(e, { owner: settings.owner, repo: settings.repo, fallback: "Failed to switch." }),
    });
  } finally {
    $switchLoading.set(false);
  }
}

export function cancelPendingSync(): void {
  $pendingSync.set(null);
}

export async function updateBranch(): Promise<void> {
  const settings = $settings.get();
  const github = getGitHub(settings);
  const activeProposal = $activeProposal.get();
  const current = $check.get();
  if (!github || !activeProposal || !current || $mergingBranch.get()) return;
  $mergingBranch.set(true);
  $background.set(null);
  try {
    const result = await updateProposalBranch(settings, github, activeProposal, current);
    if (result.status === "conflict") {
      $conflictNotice.set({
        number: activeProposal.number,
        head_ref: activeProposal.head_ref,
        html_url: activeProposal.html_url,
        detail: result.detail,
        fixInstructions:
          `git fetch origin\n` +
          `git checkout ${activeProposal.head_ref}\n` +
          `git merge origin/${settings.branch}\n` +
          `# Resolve the conflict markers — if it's unclear which value should win, check with the designer.\n` +
          `git add <resolved files>\n` +
          `git commit\n` +
          `git push`,
      });
    } else {
      resetStaleness();
      const prev = $check.get();
      $check.set({ ...result.pending, gitContent: result.plan.newGitContent, proposals: prev?.proposals ?? [] });

      const targetLabel = `PR #${activeProposal.number}`;
      await resolvePendingSync(
        result.plan,
        targetLabel,
        (refreshed) => {
          const prevAfterCommit = $check.get();
          $check.set({ ...refreshed, gitContent: result.plan.newGitContent, proposals: prevAfterCommit?.proposals ?? [] });
          $background.set({
            success: true,
            text: `${targetLabel}'s branch updated to match ${settings.branch} — ${result.plan.safeDotPaths.size} variable${result.plan.safeDotPaths.size === 1 ? "" : "s"} were updated to match.`,
          });
        },
        (e) =>
          $background.set({
            success: false,
            text: describeGitHubError(e, { owner: settings.owner, repo: settings.repo, fallback: "Failed to update branch." }),
          })
      );
    }
  } catch (e) {
    $staleness.set(null);
    $background.set({
      success: false,
      text: describeGitHubError(e, { owner: settings.owner, repo: settings.repo, fallback: "Failed to update branch." }),
    });
  } finally {
    $mergingBranch.set(false);
  }
}

export async function abandonProposal(): Promise<void> {
  const settings = $settings.get();
  const github = getGitHub(settings);
  const activeProposal = $activeProposal.get();
  const current = $check.get();
  if (!github || !activeProposal || !current || $mergingBranch.get()) return;
  $mergingBranch.set(true);
  $background.set(null);
  try {
    const { plan, pending } = await requestAbandonProposal(settings, github, activeProposal, current);
    const abandonedNumber = activeProposal.number;
    $activeProposal.set(null);
    resetStaleness();
    const prev = $check.get();
    $check.set({ ...pending, gitContent: plan.newGitContent, proposals: prev?.proposals ?? [] });
    $background.set({
      success: true,
      text: `PR #${abandonedNumber} abandoned — you're back on ${settings.branch}.`,
    });

    await resolvePendingSync(
      plan,
      settings.branch,
      (refreshed) => {
        const prevAfterCommit = $check.get();
        $check.set({ ...refreshed, gitContent: plan.newGitContent, proposals: prevAfterCommit?.proposals ?? [] });
        $background.set({
          success: true,
          text: `PR #${abandonedNumber} abandoned — you're back on ${settings.branch}, and ${plan.safeDotPaths.size} variable${plan.safeDotPaths.size === 1 ? "" : "s"} were updated to match.`,
        });
      },
      (e) =>
        $background.set({
          success: false,
          text: describeGitHubError(e, { owner: settings.owner, repo: settings.repo, fallback: "Failed to abandon PR." }),
        })
    );
  } catch (e) {
    $background.set({
      success: false,
      text: describeGitHubError(e, { owner: settings.owner, repo: settings.repo, fallback: "Failed to abandon PR." }),
    });
  } finally {
    $mergingBranch.set(false);
  }
}

export function dismissResetNotice(): void {
  $dismissedResetNoticePaths.set($check.get()?.resetNotice?.paths ?? []);
}

export function dismissStaleness(): void {
  $dismissedStalenessCount.set($staleness.get()?.count ?? 0);
}

export function setDescription(value: string): void {
  $description.set(value);
}

export async function submitProposal(): Promise<void> {
  const check = $check.get();
  const description = $description.get();
  const settings = $settings.get();
  const github = getGitHub(settings);
  const activeProposal = $activeProposal.get();
  if (!check?.figmaContent || !description.trim() || !github) {
    $submitError.set("Please enter a description.");
    return;
  }
  $background.set(null);
  $submitting.set(true);
  $submitError.set(null);
  try {
    const wasUpdate = Boolean(activeProposal);
    const pr = await requestSubmitProposal(
      settings,
      github,
      check.figmaContent,
      check.diffs,
      description,
      activeProposal
    );
    $activeProposal.set({
      number: pr.number,
      html_url: pr.html_url,
      head_ref: pr.head_ref,
      title: activeProposal?.title ?? description,
    });
    $check.set({ ...check, diffs: [], gitContent: pr.gitContent });
    $description.set("");
    $submitResult.set({ ...pr, wasUpdate });
    $submitting.set(false);
  } catch (e) {
    $submitting.set(false);
    $submitError.set(describeGitHubError(e, { owner: settings.owner, repo: settings.repo, fallback: "An error occurred." }));
    $submitResult.set(null);
  }
}

export async function resetToGit(): Promise<void> {
  const check = $check.get();
  const settings = $settings.get();
  const activeProposal = $activeProposal.get();
  if (!check?.gitContent) {
    $resetError.set("Nothing to reset to yet.");
    return;
  }
  $background.set(null);
  $resetting.set(true);
  $resetError.set(null);
  try {
    const diffSettings = resolveDiffSettings(settings, activeProposal);
    const refreshed = await resetFigmaToGit(check.gitContent, diffSettings);
    $check.set({ ...check, ...refreshed });
    $resetResult.set(refreshed);
    $resetting.set(false);
  } catch (e) {
    $resetting.set(false);
    $resetError.set(e instanceof Error ? e.message : "An error occurred.");
    $resetResult.set(null);
  }
}

export async function loadExportPreview(): Promise<void> {
  $exportPreviewLoading.set(true);
  $exportPreviewError.set(null);
  try {
    const json = await requestExport();
    $exportPreviewJson.set(json);
    $exportPreviewLoading.set(false);
  } catch (e) {
    $exportPreviewLoading.set(false);
    $exportPreviewError.set(e instanceof Error ? e.message : "An error occurred.");
    $exportPreviewJson.set(null);
  }
}

function settingsIdentityKey(settings: PluginSettings): string {
  return JSON.stringify([settings.owner, settings.repo, settings.branch, settings.filePath]);
}

let lastSettingsIdentity = settingsIdentityKey($settings.get());

// Whatever $check/lastGoodResult knew came from the previous owner/repo/branch/filePath's
// lineage — reusing it as a drift baseline against a target it has no relation to is what let
// idle-drift auto-apply mistake Figma's real state for "unchanged" and silently wipe it out.
// Clearing it here forces the next check to run through applyIdleDrift's own "nothing to
// compare against yet" path, which already never auto-applies.
$settings.listen((settings) => {
  const identity = settingsIdentityKey(settings);
  if (identity === lastSettingsIdentity) return;
  lastSettingsIdentity = identity;
  $check.set(null);
  $activeProposal.set(null);
  resetStaleness();
  $background.set(null);
});

function pollSilently(intervalMs: number, tick: () => Promise<void>): () => void {
  const interval = setInterval(() => {
    tick().catch((e) => {
      const { owner, repo } = $settings.get();
      $connectionError.set(describeGitHubError(e, { owner, repo, fallback: "A background sync check failed." }));
    });
  }, intervalMs);
  return () => clearInterval(interval);
}

export function initProposalsSync(): () => void {
  checkForChanges();

  // Figma-only — never touches GitHub — so a successful tick here says nothing about whether
  // the connection to GitHub (tracked by the slow poll below) is actually healthy again.
  const stopFastPoll = pollSilently(FAST_POLL_INTERVAL_MS, async () => {
    const current = $check.get();
    if (!current) return;
    const diffSettings = resolveDiffSettings($settings.get(), $activeProposal.get());
    const result = await checkFigmaChanges(current.gitContent, diffSettings);
    setDataIfChanged($check, { ...current, ...result });
  });

  const stopSlowPoll = pollSilently(SLOW_POLL_INTERVAL_MS, async () => {
    if ($pendingSync.get()) return;
    const { result, error } = await refreshActiveProposal();
    setDataIfChanged($check, result);
    $connectionError.set(error);
  });

  return () => {
    stopFastPoll();
    stopSlowPoll();
  };
}
