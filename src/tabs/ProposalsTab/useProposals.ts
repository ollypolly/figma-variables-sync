import { useCallback, useEffect, useRef, useState } from "preact/hooks";

import { useAppContext } from "@hooks/useAppContext";
import { useAsync } from "@hooks/useAsync";
import { useDraftDescription } from "@hooks/useDraftDescription";
import { useGitHub } from "@hooks/useGitHub";
import { requestExport } from "@services/figmaMessages";
import {
  applySafeSubset,
  checkFigmaChanges,
  computeSafeSubset,
  resetFigmaToGit,
  resolveDiffSettings,
} from "@services/gitSync";
import {
  checkActiveProposalStatus,
  checkForProposalChanges,
  submitProposal,
  type ProposalCheckResult,
} from "@services/proposals";
import type { ActiveProposal } from "../../types";

const FAST_POLL_INTERVAL_MS = 3_000;
const SLOW_POLL_INTERVAL_MS = 30_000;

function useLatestRef<T>(value: T) {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref;
}

function pollSilently(intervalMs: number, tick: () => Promise<void>): () => void {
  const interval = setInterval(() => {
    tick().catch(() => {});
  }, intervalMs);
  return () => clearInterval(interval);
}

function setDataIfChanged<T>(setData: (updater: (prev: T | null) => T) => void, next: T): void {
  setData((prev) => (prev && JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
}

function applyPushedResult(current: ProposalCheckResult, gitContent: string): ProposalCheckResult {
  return { ...current, diffs: [], gitContent };
}

interface PendingSwitch {
  target: ActiveProposal | null;
  targetLabel: string;
  count: number;
  commit: () => Promise<void>;
}

function deriveStatus({
  background,
  resetToGit,
  submit,
  check,
}: {
  background: { success: boolean; text: string } | null;
  resetToGit: { error: string | null; data: unknown };
  submit: { error: string | null; data: { number: number; html_url: string; wasUpdate: boolean } | null };
  check: { error: string | null };
}): { success: boolean; text: string; link?: string } | null {
  if (background) return background;
  if (resetToGit.error) return { success: false, text: resetToGit.error };
  if (resetToGit.data) return { success: true, text: "Figma reset to match git." };
  if (submit.error) return { success: false, text: submit.error };
  if (submit.data) {
    return {
      success: true,
      text: submit.data.wasUpdate
        ? `Pushed to PR #${submit.data.number}.`
        : `PR #${submit.data.number} created.`,
      link: submit.data.html_url,
    };
  }
  if (check.error) return { success: false, text: check.error };
  return null;
}

export function useProposals(active: boolean) {
  const { settings, settingsLoading, isConfigured, activeProposal, activeProposalLoading, setActiveProposal } =
    useAppContext();
  const github = useGitHub(settings);

  const { description, setDescription } = useDraftDescription();

  const [background, setBackground] = useState<{ success: boolean; text: string } | null>(null);
  const [pendingSwitch, setPendingSwitch] = useState<PendingSwitch | null>(null);
  const [switchLoading, setSwitchLoading] = useState(false);

  const lastGoodCheckData = useRef<ProposalCheckResult | null>(null);

  const checkForActiveProposal = useCallback(async (): Promise<ProposalCheckResult> => {
    if (!github) throw new Error("Not configured.");

    const { result, resolvedDeadProposal } = await checkActiveProposalStatus(
      settings,
      github,
      activeProposal,
      lastGoodCheckData.current
    );

    if (resolvedDeadProposal) {
      setActiveProposal(null);
      setBackground({
        success: true,
        text: `PR #${resolvedDeadProposal.number} was ${resolvedDeadProposal.reason} — you're back on Main, and ${resolvedDeadProposal.count} variable${resolvedDeadProposal.count === 1 ? "" : "s"} were updated to match.`,
      });
    }

    return result;
  }, [settings, github, activeProposal, setActiveProposal]);

  const check = useAsync<ProposalCheckResult>(checkForActiveProposal);

  useEffect(() => {
    lastGoodCheckData.current = check.data;
  }, [check.data]);

  const latestCheckData = useLatestRef(check.data);

  const exportPreview = useAsync<string>(useCallback(() => requestExport(), []));

  const submit = useAsync<{
    number: number;
    html_url: string;
    head_ref: string;
    gitContent: string;
    wasUpdate: boolean;
  }>(
    useCallback(async () => {
      if (!check.data?.figmaContent || !description.trim() || !github) {
        throw new Error("Please enter a description.");
      }
      setBackground(null);
      const wasUpdate = Boolean(activeProposal);
      const pr = await submitProposal(
        settings,
        github,
        check.data.figmaContent,
        check.data.diffs,
        description,
        activeProposal
      );
      setActiveProposal({
        number: pr.number,
        html_url: pr.html_url,
        head_ref: pr.head_ref,
        title: activeProposal?.title ?? description,
      });
      check.setData(applyPushedResult(check.data, pr.gitContent));
      setDescription("");
      return { ...pr, wasUpdate };
    }, [check.data, description, settings, github, activeProposal, setActiveProposal, check.setData])
  );

  const resetToGit = useAsync(
    useCallback(async () => {
      if (!check.data?.gitContent) throw new Error("Nothing to reset to yet.");
      setBackground(null);
      const diffSettings = resolveDiffSettings(settings, activeProposal);
      const refreshed = await resetFigmaToGit(check.data.gitContent, diffSettings);
      check.setData({ ...check.data, ...refreshed });
      return refreshed;
    }, [check.data, settings, activeProposal, check.setData])
  );

  const requestSwitch = useCallback(
    async (target: ActiveProposal | null) => {
      if (!github || !latestCheckData.current) return;
      setBackground(null);
      const targetSettings = resolveDiffSettings(settings, target);

      const planSwitch = async () => {
        const current = latestCheckData.current;
        if (!current) throw new Error("Nothing to switch from.");
        const file = await github.getFile(targetSettings);
        const newGitContent = file?.content ?? "{}";
        const safeDotPaths = computeSafeSubset(current.gitContent, newGitContent, current.diffs);
        return { newGitContent, safeDotPaths };
      };

      const commit = async () => {
        try {
          const { newGitContent, safeDotPaths } = await planSwitch();
          const refreshed = await applySafeSubset(newGitContent, safeDotPaths, targetSettings);
          setActiveProposal(target);
          check.setData((prev) => ({ ...refreshed, gitContent: newGitContent, proposals: prev?.proposals ?? [] }));
          setPendingSwitch(null);
        } catch (e) {
          setBackground({ success: false, text: e instanceof Error ? e.message : "Failed to switch." });
        }
      };

      setSwitchLoading(true);
      try {
        if (settings.skipSwitchConfirmation) {
          await commit();
          return;
        }
        const { safeDotPaths } = await planSwitch();
        setPendingSwitch({
          target,
          targetLabel: target ? `PR #${target.number}` : "Main",
          count: safeDotPaths.size,
          commit,
        });
      } catch (e) {
        setBackground({ success: false, text: e instanceof Error ? e.message : "Failed to switch." });
      } finally {
        setSwitchLoading(false);
      }
    },
    [github, settings, setActiveProposal, check.setData]
  );

  useEffect(() => {
    if (!settingsLoading && !activeProposalLoading && isConfigured && active) {
      check.execute();
    }
  }, [settingsLoading, activeProposalLoading, isConfigured, active, activeProposal?.head_ref ?? null]);

  const pollingEnabled = !settingsLoading && !activeProposalLoading && isConfigured && active && !submit.loading;

  useEffect(() => {
    if (!pollingEnabled || !github) return;
    const diffSettings = resolveDiffSettings(settings, activeProposal);

    return pollSilently(FAST_POLL_INTERVAL_MS, async () => {
      const current = latestCheckData.current;
      if (!current) return;

      const result = await checkFigmaChanges(current.gitContent, diffSettings);
      setDataIfChanged(check.setData, { ...current, ...result });
    });
  }, [pollingEnabled, github, settings, activeProposal, check.setData]);

  useEffect(() => {
    if (!pollingEnabled || !github) return;

    return pollSilently(SLOW_POLL_INTERVAL_MS, async () => {
      const result = await checkForActiveProposal();
      setDataIfChanged(check.setData, result);
    });
  }, [pollingEnabled, github, checkForActiveProposal, check.setData]);

  const status = deriveStatus({ background, resetToGit, submit, check });

  const openProposals = (check.data?.proposals ?? []).filter((p) => p.state === "open");

  return {
    settingsLoading,
    isConfigured,
    checking: check.loading,
    diffItems: check.data?.diffs ?? [],
    primaryModeName: check.data?.primaryModeName ?? "Default",
    openProposals,
    activeProposal,
    requestSwitch,
    pendingSwitch,
    switchLoading,
    cancelSwitch: () => setPendingSwitch(null),
    description,
    setDescription,
    submitting: submit.loading,
    status,
    collisionNotice: check.data?.collisionNotice ?? null,
    checkForChanges: check.execute,
    submitProposal: submit.execute,
    resetting: resetToGit.loading,
    resetToGit: resetToGit.execute,
    exportPreviewJson: exportPreview.data,
    exportPreviewLoading: exportPreview.loading,
    exportPreviewError: exportPreview.error,
    loadExportPreview: exportPreview.execute,
  };
}
