import { useCallback, useEffect, useState } from "preact/hooks";

import { useAppContext } from "@hooks/useAppContext";
import { useAsync } from "@hooks/useAsync";
import { useGitHub } from "@hooks/useGitHub";
import { requestExport } from "@services/figmaMessages";
import { checkForProposalChanges, submitProposal, type ProposalCheckResult } from "@services/proposals";

export function useProposals(active: boolean) {
  const { settings, settingsLoading, isConfigured } = useAppContext();
  const github = useGitHub(settings);

  const [description, setDescription] = useState("");

  const check = useAsync<ProposalCheckResult>(
    useCallback(async () => {
      if (!github) throw new Error("Not configured.");
      return checkForProposalChanges(settings, github);
    }, [settings, github])
  );

  const exportPreview = useAsync<string>(useCallback(() => requestExport(), []));

  const submit = useAsync<{ number: number; html_url: string }>(
    useCallback(async () => {
      if (!check.data?.figmaContent || !description.trim() || !github) {
        throw new Error("Please enter a description.");
      }
      const pr = await submitProposal(settings, github, check.data.figmaContent, check.data.diffs, description);
      setDescription("");
      return pr;
    }, [check.data, description, settings, github])
  );

  useEffect(() => {
    if (!settingsLoading && isConfigured && active) {
      check.execute();
    }
  }, [settingsLoading, active]);

  const status = submit.error
    ? { success: false, text: submit.error }
    : submit.data
      ? {
          success: true,
          text: `PR #${submit.data.number} created.`,
          link: submit.data.html_url,
        }
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
    collisionNotice: check.data?.collisionNotice ?? null,
    checkForChanges: check.execute,
    submitProposal: submit.execute,
    exportPreviewJson: exportPreview.data,
    exportPreviewLoading: exportPreview.loading,
    exportPreviewError: exportPreview.error,
    loadExportPreview: exportPreview.execute,
  };
}
