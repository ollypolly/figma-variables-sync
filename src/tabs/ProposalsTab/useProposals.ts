import { useCallback, useEffect, useRef, useState } from "preact/hooks";

import { useAppContext } from "@hooks/useAppContext";
import { useAsync } from "@hooks/useAsync";
import { useGitHub } from "@hooks/useGitHub";
import { requestExport } from "@services/figmaMessages";
import {
  checkFigmaChanges,
  checkForProposalChanges,
  resolveDiffSettings,
  submitProposal,
  type ProposalCheckResult,
} from "@services/proposals";

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

function clearPushedDiffs(current: ProposalCheckResult): ProposalCheckResult {
  return { ...current, diffs: [] };
}

export function useProposals(active: boolean) {
  const { settings, settingsLoading, isConfigured, activeProposal, activeProposalLoading, setActiveProposal } =
    useAppContext();
  const github = useGitHub(settings);

  const [description, setDescription] = useState("");

  const check = useAsync<ProposalCheckResult>(
    useCallback(async () => {
      if (!github) throw new Error("Not configured.");
      return checkForProposalChanges(settings, github, activeProposal);
    }, [settings, github, activeProposal])
  );

  const exportPreview = useAsync<string>(useCallback(() => requestExport(), []));

  const submit = useAsync<{ number: number; html_url: string; head_ref: string; wasUpdate: boolean }>(
    useCallback(async () => {
      if (!check.data?.figmaContent || !description.trim() || !github) {
        throw new Error("Please enter a description.");
      }
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
      check.setData(clearPushedDiffs(check.data));
      setDescription("");
      return { ...pr, wasUpdate };
    }, [check.data, description, settings, github, activeProposal, setActiveProposal, check.setData])
  );

  useEffect(() => {
    if (!settingsLoading && !activeProposalLoading && isConfigured && active) {
      check.execute();
    }
  }, [settingsLoading, activeProposalLoading, isConfigured, active, activeProposal?.head_ref ?? null]);

  const pollingEnabled = !settingsLoading && !activeProposalLoading && isConfigured && active && !submit.loading;
  const latestCheckData = useLatestRef(check.data);

  useEffect(() => {
    if (!pollingEnabled || !github) return;
    const diffSettings = resolveDiffSettings(settings, activeProposal);

    return pollSilently(FAST_POLL_INTERVAL_MS, async () => {
      const current = latestCheckData.current;
      if (!current) return;

      const result = await checkFigmaChanges(current.gitContent, diffSettings);
      const merged = { ...current, ...result };
      check.setData((prev) => (prev && JSON.stringify(prev) === JSON.stringify(merged) ? prev : merged));
    });
  }, [pollingEnabled, github, settings, activeProposal, check.setData]);

  useEffect(() => {
    if (!pollingEnabled || !github) return;

    return pollSilently(SLOW_POLL_INTERVAL_MS, async () => {
      const result = await checkForProposalChanges(settings, github, activeProposal);
      check.setData((prev) => (prev && JSON.stringify(prev) === JSON.stringify(result) ? prev : result));
    });
  }, [pollingEnabled, github, settings, activeProposal, check.setData]);

  const status = submit.error
    ? { success: false, text: submit.error }
    : submit.data
      ? {
          success: true,
          text: submit.data.wasUpdate
            ? `Pushed to PR #${submit.data.number}.`
            : `PR #${submit.data.number} created.`,
          link: submit.data.html_url,
        }
      : check.error
        ? { success: false, text: check.error }
        : null;

  const openProposals = (check.data?.proposals ?? []).filter((p) => p.state === "open");

  return {
    settingsLoading,
    isConfigured,
    checking: check.loading,
    diffItems: check.data?.diffs ?? [],
    openProposals,
    activeProposal,
    setActiveProposal,
    description,
    setDescription,
    submitting: submit.loading,
    status,
    collisionNotice: check.data?.collisionNotice ?? null,
    checkForChanges: check.execute,
    submitProposal: submit.execute,
    exportPreviewJson: exportPreview.data,
    exportPreviewLoading: exportPreview.loading,
    exportPreviewError: exportPreview.error,
    loadExportPreview: exportPreview.execute,
  };
}
