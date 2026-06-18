import { useCallback, useEffect, useState } from "preact/hooks";

import { computeDiff, type DiffItem } from "@common/diff";
import { useAsync } from "@hooks/useAsync";
import { useGitHub } from "@hooks/useGitHub";
import { usePluginSettings } from "@hooks/usePluginSettings";
import { requestExport } from "@services/figmaMessages";

export interface Proposal {
  number: number;
  title: string;
  state: string;
  html_url: string;
  head_ref: string;
}

interface CheckResult {
  diffs: DiffItem[];
  figmaContent: string;
  proposals: Proposal[];
}

export function useProposals(active: boolean) {
  const { settings, loading: settingsLoading, isConfigured } = usePluginSettings();
  const github = useGitHub(settings);

  const [description, setDescription] = useState("");

  const check = useAsync<CheckResult>(
    useCallback(async () => {
      if (!github) throw new Error("Not configured.");
      const fileData = await github.getFile({
        owner: settings.owner,
        repo: settings.repo,
        filePath: settings.filePath,
        branch: settings.branch,
      });
      const gitContent = fileData?.content ?? "{}";
      const figmaContent = await requestExport();
      const diffs = computeDiff(figmaContent, gitContent, "proposals");
      const proposals = await github.listPullRequests(
        settings.owner,
        settings.repo,
        settings.branch
      );
      return { diffs, figmaContent, proposals };
    }, [settings, github])
  );

  const submit = useAsync<string>(
    useCallback(async () => {
      if (!check.data?.figmaContent || !description.trim() || !github) {
        throw new Error("Please enter a description.");
      }

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
        check.data.figmaContent,
        fileData?.sha,
        branchName
      );

      const pr = await github.createPullRequest(
        config,
        description,
        `Design variable changes exported from Figma.\n\n${description}`,
        branchName
      );

      setDescription("");
      await check.execute();
      return `PR #${pr.number} created.`;
    }, [check.data, description, settings, github, check.execute])
  );

  useEffect(() => {
    if (!settingsLoading && isConfigured && active) {
      check.execute();
    }
  }, [settingsLoading, active]);

  const status = submit.error
    ? { success: false, text: submit.error }
    : submit.data
      ? { success: true, text: submit.data }
      : check.error
        ? { success: false, text: check.error }
        : null;

  return {
    settingsLoading,
    isConfigured,
    checking: check.loading,
    diffItems: check.data?.diffs ?? [],
    proposals: check.data?.proposals ?? [],
    description,
    setDescription,
    submitting: submit.loading,
    status,
    checkForChanges: check.execute,
    submitProposal: submit.execute,
  };
}
