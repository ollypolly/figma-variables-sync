import { useCallback, useEffect } from "preact/hooks";

import { computeDiff, type DiffItem } from "@common/diff";
import { useAsync } from "@hooks/useAsync";
import { useGitHub } from "@hooks/useGitHub";
import { usePluginSettings } from "@hooks/usePluginSettings";
import { requestExport, requestImport } from "@services/figmaMessages";

interface CheckResult {
  diffs: DiffItem[];
  gitContent: string;
}

export function useUpdates() {
  const { settings, loading: settingsLoading, isConfigured } = usePluginSettings();
  const github = useGitHub(settings);

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
      const diffs = computeDiff(figmaContent, gitContent, "updates");
      return { diffs, gitContent };
    }, [settings, github])
  );

  const importAction = useAsync<string>(
    useCallback(async () => {
      if (!check.data?.gitContent) throw new Error("No updates to import.");
      const result = await requestImport(check.data.gitContent);
      if (!result.success) throw new Error(result.message);
      await check.execute();
      return result.message;
    }, [check.data, check.execute])
  );

  useEffect(() => {
    if (!settingsLoading && isConfigured) {
      check.execute();
    }
  }, [settingsLoading]);

  const status = importAction.error
    ? { success: false, text: importAction.error }
    : importAction.data
      ? { success: true, text: importAction.data }
      : check.error
        ? { success: false, text: check.error }
        : null;

  return {
    settingsLoading,
    isConfigured,
    checking: check.loading,
    diffItems: check.data?.diffs ?? [],
    importing: importAction.loading,
    status,
    checkForUpdates: check.execute,
    acceptUpdates: importAction.execute,
  };
}
