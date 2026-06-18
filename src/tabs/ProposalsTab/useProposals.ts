import { useCallback, useEffect, useState } from "preact/hooks";

import { computeDiff, type DiffItem } from "@common/diff";
import { useGitHub } from "../../hooks/useGitHub";
import { usePluginSettings } from "../../hooks/usePluginSettings";
import { requestExport } from "@services/figmaMessages";

export interface Proposal {
  number: number;
  title: string;
  state: string;
  html_url: string;
  head_ref: string;
}

export function useProposals() {
  const { settings, loading: settingsLoading, isConfigured } = usePluginSettings();
  const github = useGitHub(settings);

  const [checking, setChecking] = useState(false);
  const [diffItems, setDiffItems] = useState<DiffItem[]>([]);
  const [figmaJson, setFigmaJson] = useState<string | null>(null);

  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<{
    success: boolean;
    text: string;
  } | null>(null);

  const checkForChanges = useCallback(async () => {
    if (!isConfigured || !github) return;
    setChecking(true);
    setStatus(null);
    setDiffItems([]);

    try {
      const fileData = await github.getFile({
        owner: settings.owner,
        repo: settings.repo,
        filePath: settings.filePath,
        branch: settings.branch,
      });
      const gitContent = fileData?.content ?? "{}";

      const figmaContent = await requestExport();
      setFigmaJson(figmaContent);

      const diffs = computeDiff(figmaContent, gitContent, "proposals");
      setDiffItems(diffs);

      const prList = await github.listPullRequests(
        settings.owner,
        settings.repo,
        settings.branch
      );
      setProposals(prList);
    } catch (e: unknown) {
      const message =
        e instanceof Error ? e.message : "Failed to check for changes.";
      setStatus({ success: false, text: message });
    } finally {
      setChecking(false);
    }
  }, [settings, isConfigured, github]);

  useEffect(() => {
    if (!settingsLoading && isConfigured) {
      checkForChanges();
    }
  }, [settingsLoading]);

  const submitProposal = useCallback(async () => {
    if (!figmaJson || !description.trim() || !github) {
      setStatus({ success: false, text: "Please enter a description." });
      return;
    }

    setSubmitting(true);
    setStatus(null);

    try {
      const config = {
        owner: settings.owner,
        repo: settings.repo,
        filePath: settings.filePath,
        branch: settings.branch,
      };

      const branchName = `figma/proposal-${Date.now()}`;
      await github.createBranch(config, branchName);

      const fileData = await github.getFile(config);
      await github.updateFile(
        config,
        description,
        figmaJson,
        fileData?.sha,
        branchName
      );

      const pr = await github.createPullRequest(
        config,
        description,
        `Design variable changes exported from Figma.\n\n${description}`,
        branchName
      );

      setStatus({ success: true, text: `PR #${pr.number} created.` });
      setDescription("");
      await checkForChanges();
    } catch (e: unknown) {
      const message =
        e instanceof Error ? e.message : "Failed to create proposal.";
      setStatus({ success: false, text: message });
    } finally {
      setSubmitting(false);
    }
  }, [figmaJson, description, settings, github, checkForChanges]);

  return {
    settingsLoading,
    isConfigured,
    checking,
    diffItems,
    proposals,
    description,
    setDescription,
    submitting,
    status,
    checkForChanges,
    submitProposal,
  };
}
