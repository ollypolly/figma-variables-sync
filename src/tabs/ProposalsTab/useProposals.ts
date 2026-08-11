import { useCallback, useEffect, useState } from "preact/hooks";

import { computeDiff, type DiffItem } from "@common/diff";
import { NamingCollisionError } from "@common/dtcg";
import { useAppContext } from "@hooks/useAppContext";
import { useAsync } from "@hooks/useAsync";
import { useGitHub } from "@hooks/useGitHub";
import { requestExport } from "@services/figmaMessages";
import { PROPOSAL_BRANCH_PREFIX } from "@services/github";
import { parsePrLabels } from "../../types";

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
  const { settings, settingsLoading, isConfigured } = useAppContext();
  const github = useGitHub(settings);

  const [description, setDescription] = useState("");
  // Overwritten (not appended to) on every check — a stale collision notice
  // from a previous check must not linger once the collision is resolved,
  // and re-checking repeatedly must not stack duplicate notices.
  const [collisionNotice, setCollisionNotice] = useState<
    { message: string; paths: string[] } | null
  >(null);

  const check = useAsync<CheckResult>(
    useCallback(async () => {
      if (!github) throw new Error("Not configured.");
      const fileData = await github.getFile(settings);
      const gitContent = fileData?.content ?? "{}";

      let figmaContent: string;
      try {
        figmaContent = await requestExport();
      } catch (e) {
        if (e instanceof NamingCollisionError) {
          setCollisionNotice({ message: e.message, paths: e.collidingPaths });
          return { diffs: [], figmaContent: "", proposals: [] };
        }
        throw e;
      }

      const { diffs, quarantined } = computeDiff(figmaContent, gitContent, "proposals");
      setCollisionNotice(
        quarantined.length > 0
          ? {
              message: `${quarantined.length} token group(s) in the repository couldn't be compared because a name collides with a sibling's path.`,
              paths: quarantined,
            }
          : null
      );

      const proposals = await github.listPullRequests(
        settings.owner,
        settings.repo,
        settings.branch
      );
      return { diffs, figmaContent, proposals };
    }, [settings, github])
  );

  const submit = useAsync<{ number: number; html_url: string }>(
    useCallback(async () => {
      if (!check.data?.figmaContent || !description.trim() || !github) {
        throw new Error("Please enter a description.");
      }

      const branchName = `${PROPOSAL_BRANCH_PREFIX}${Date.now()}`;
      await github.createBranch(settings, branchName);

      const fileData = await github.getFile(settings);
      await github.updateFile(
        settings,
        description,
        check.data.figmaContent,
        fileData?.sha,
        branchName
      );

      const pr = await github.createPullRequest(
        settings,
        description,
        `Design variable changes exported from Figma.\n\n${description}`,
        branchName,
        parsePrLabels(settings.prLabels)
      );

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
    collisionNotice,
    checkForChanges: check.execute,
    submitProposal: submit.execute,
  };
}
