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

// Two different things are being polled, at two different safe speeds:
// - The Figma-side re-diff (FAST) makes no network calls at all, so it can run often enough to
//   feel instant when a designer edits a variable.
// - The GitHub-side check (SLOW) hits the API twice per tick — needs a much longer interval to
//   stay well clear of GitHub's per-hour rate limit and its separate secondary abuse-rate limit
//   on rapid, sustained request bursts.
const FAST_POLL_INTERVAL_MS = 3_000;
const SLOW_POLL_INTERVAL_MS = 30_000;

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
      // Every current diff was just staged and pushed (no partial staging yet) — clear them
      // locally rather than re-fetching from GitHub, whose Contents API can serve a stale read
      // for a while right after a write to the same ref.
      check.setData({ ...check.data, diffs: [] });
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

  // The fast poll below deliberately doesn't list check.data as a dependency (that would tear
  // down and rebuild the interval every few seconds, on the fast poll's own writes). It still
  // needs each tick to see the *latest* gitContent though — in particular the slow poll's refresh
  // 30s later — so read it from a ref updated on every check.data change, not a closed-over value.
  const latestCheckData = useRef(check.data);
  useEffect(() => {
    latestCheckData.current = check.data;
  }, [check.data]);

  // Figma's Plugin API has no push event for local variable/collection changes (only
  // documentchange/stylechange/nodechange, none of which cover variables), so noticing a
  // designer's own edit requires polling. This loop makes no GitHub calls — it just re-exports
  // Figma and re-diffs against the git baseline already cached from the last slow check below —
  // so it's cheap enough to run every few seconds without touching any rate limit. Runs outside
  // useAsync's execute so it never flips `checking` (no spinner flash), and only replaces
  // check.data if the result actually differs, so an unchanged poll causes no visible re-render.
  useEffect(() => {
    if (!pollingEnabled || !github) return;
    const diffSettings = resolveDiffSettings(settings, activeProposal);

    const interval = setInterval(async () => {
      const gitContent = latestCheckData.current?.gitContent;
      if (gitContent === undefined) return; // no baseline yet — the initial slow check hasn't landed

      try {
        const result = await checkFigmaChanges(gitContent, diffSettings);
        check.setData((prev) => {
          if (!prev) return prev as never; // unreachable — a baseline implies check.data was set
          const merged = { ...prev, ...result };
          return JSON.stringify(prev) === JSON.stringify(merged) ? prev : merged;
        });
      } catch {
        // Silent background poll — a manual Refresh already surfaces errors from this same
        // call, so a transient failure here shouldn't interrupt the designer.
      }
    }, FAST_POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [pollingEnabled, github, settings, activeProposal, check.setData]);

  // The GitHub-side half of the same idea: refreshes gitContent + open PRs on a much longer
  // interval, for the reasons in the constants above.
  useEffect(() => {
    if (!pollingEnabled || !github) return;

    const interval = setInterval(async () => {
      try {
        const result = await checkForProposalChanges(settings, github, activeProposal);
        check.setData((prev) =>
          prev && JSON.stringify(prev) === JSON.stringify(result) ? prev : result
        );
      } catch {
        // Silent background poll — a manual Refresh already surfaces errors from this same
        // call, so a transient failure here shouldn't interrupt the designer.
      }
    }, SLOW_POLL_INTERVAL_MS);

    return () => clearInterval(interval);
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
