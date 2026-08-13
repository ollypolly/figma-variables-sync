import { atom, computed, type WritableAtom } from "nanostores";

import { GitHubService } from "@services/github";
import { requestExport } from "@services/figmaMessages";
import {
  applySafeSubset,
  checkFigmaChanges,
  computeSafeSubset,
  resetFigmaToGit,
  resolveDiffSettings,
  type FigmaDiffResult,
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

interface PendingSwitch {
  target: ActiveProposal | null;
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
export const $checkError = atom<string | null>(null);

export const $background = atom<{ success: boolean; text: string } | null>(null);
export const $pendingSwitch = atom<PendingSwitch | null>(null);
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
  [$background, $resetError, $resetResult, $submitError, $submitResult, $checkError],
  (background, resetError, resetResult, submitError, submitResult, checkError) => {
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
    if (checkError) return { success: false, text: checkError };
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

async function refreshActiveProposal(): Promise<ProposalCheckResult> {
  const settings = $settings.get();
  const github = getGitHub(settings);
  if (!github) throw new Error("Not configured.");
  const activeProposal = $activeProposal.get();
  const lastGoodResult = $check.get();

  const {
    result,
    resolvedDeadProposal,
    staleness: nextStaleness,
    syncedCount,
  } = await checkActiveProposalStatus(settings, github, activeProposal, lastGoodResult);

  if (resolvedDeadProposal) {
    $activeProposal.set(null);
    resetStaleness();
    $background.set({
      success: true,
      text: `PR #${resolvedDeadProposal.number} was ${resolvedDeadProposal.reason} — you're back on ${settings.branch}, and ${resolvedDeadProposal.count} variable${resolvedDeadProposal.count === 1 ? "" : "s"} were updated to match.`,
    });
  } else {
    $staleness.set(nextStaleness);
    if (nextStaleness === null) {
      $conflictNotice.set(null);
    }
    if (syncedCount > 0) {
      const targetLabel = activeProposal ? `PR #${activeProposal.number}` : settings.branch;
      $background.set({
        success: true,
        text: `${syncedCount} variable${syncedCount === 1 ? "" : "s"} updated to match ${targetLabel}.`,
      });
    }
  }

  return result;
}

export async function checkForChanges(): Promise<ProposalCheckResult | null> {
  $checking.set(true);
  $checkError.set(null);
  try {
    const result = await refreshActiveProposal();
    $check.set(result);
    $checking.set(false);
    return result;
  } catch (e) {
    $checking.set(false);
    $checkError.set(e instanceof Error ? e.message : "An error occurred.");
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

  const planSwitch = async () => {
    const latest = $check.get();
    if (!latest) throw new Error("Nothing to switch from.");
    const file = await github.getFile(targetSettings);
    const newGitContent = file?.content ?? "{}";
    const safeDotPaths = await computeSafeSubset(latest.gitContent, newGitContent);
    return { newGitContent, safeDotPaths };
  };

  const commit = async () => {
    try {
      const { newGitContent, safeDotPaths } = await planSwitch();
      const refreshed = await applySafeSubset(newGitContent, safeDotPaths, targetSettings);
      $activeProposal.set(target);
      resetStaleness();
      const prev = $check.get();
      $check.set({ ...refreshed, gitContent: newGitContent, proposals: prev?.proposals ?? [] });
      $pendingSwitch.set(null);
    } catch (e) {
      $background.set({ success: false, text: e instanceof Error ? e.message : "Failed to switch." });
    }
  };

  $switchLoading.set(true);
  try {
    if (settings.skipSwitchConfirmation) {
      await commit();
      return;
    }
    const { safeDotPaths } = await planSwitch();
    $pendingSwitch.set({
      target,
      targetLabel: target ? `PR #${target.number}` : settings.branch,
      count: safeDotPaths.size,
      commit,
    });
  } catch (e) {
    $background.set({ success: false, text: e instanceof Error ? e.message : "Failed to switch." });
  } finally {
    $switchLoading.set(false);
  }
}

export function cancelSwitch(): void {
  $pendingSwitch.set(null);
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
      $check.set({ ...result.refreshed, gitContent: result.gitContent, proposals: prev?.proposals ?? [] });
      $background.set({
        success: true,
        text: `PR #${activeProposal.number}'s branch updated to match ${settings.branch} — ${result.count} variable${result.count === 1 ? "" : "s"} were updated to match.`,
      });
    }
  } catch (e) {
    $staleness.set(null);
    $background.set({ success: false, text: e instanceof Error ? e.message : "Failed to update branch." });
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
    const { refreshed, gitContent, count } = await requestAbandonProposal(settings, github, activeProposal, current);
    const abandonedNumber = activeProposal.number;
    $activeProposal.set(null);
    resetStaleness();
    const prev = $check.get();
    $check.set({ ...refreshed, gitContent, proposals: prev?.proposals ?? [] });
    $background.set({
      success: true,
      text: `PR #${abandonedNumber} abandoned — you're back on ${settings.branch}, and ${count} variable${count === 1 ? "" : "s"} were updated to match.`,
    });
  } catch (e) {
    $background.set({ success: false, text: e instanceof Error ? e.message : "Failed to abandon PR." });
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
    $submitError.set(e instanceof Error ? e.message : "An error occurred.");
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

function pollSilently(intervalMs: number, tick: () => Promise<void>): () => void {
  const interval = setInterval(() => {
    tick().catch(() => {});
  }, intervalMs);
  return () => clearInterval(interval);
}

export function initProposalsSync(): () => void {
  checkForChanges();

  const stopFastPoll = pollSilently(FAST_POLL_INTERVAL_MS, async () => {
    const current = $check.get();
    if (!current) return;
    const diffSettings = resolveDiffSettings($settings.get(), $activeProposal.get());
    const result = await checkFigmaChanges(current.gitContent, diffSettings);
    setDataIfChanged($check, { ...current, ...result });
  });

  const stopSlowPoll = pollSilently(SLOW_POLL_INTERVAL_MS, async () => {
    const result = await refreshActiveProposal();
    setDataIfChanged($check, result);
  });

  return () => {
    stopFastPoll();
    stopSlowPoll();
  };
}
