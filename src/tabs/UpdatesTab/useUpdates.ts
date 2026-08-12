import { useCallback, useEffect } from "preact/hooks";

import { computeDiff, type DiffItem } from "@common/diff";
import { useAppContext } from "@hooks/useAppContext";
import { useAsync } from "@hooks/useAsync";
import { useGitHub } from "@hooks/useGitHub";
import { requestExport, requestImport } from "@services/figmaMessages";

interface CheckResult {
  diffs: DiffItem[];
  gitContent: string;
  primaryModeName: string;
}

export function useUpdates(active: boolean) {
  const { settings, settingsLoading, isConfigured } = useAppContext();
  const github = useGitHub(settings);

  const check = useAsync<CheckResult>(
    useCallback(async () => {
      if (!github) throw new Error("Not configured.");
      const fileData = await github.getFile(settings);
      if (!fileData) {
        throw new Error(
          `Token file not found at ${settings.filePath} on branch "${settings.branch}". Push the file to GitHub first.`
        );
      }
      const gitContent = fileData.content;
      const figmaContent = await requestExport();
      // Quarantined paths aren't surfaced here — this tab is being retired.
      const { diffs, primaryModeName } = computeDiff(figmaContent, gitContent, "updates");
      return { diffs, gitContent, primaryModeName };
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
    if (!settingsLoading && isConfigured && active) {
      check.execute();
    }
  }, [settingsLoading, active]);

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
    primaryModeName: check.data?.primaryModeName ?? "Default",
    importing: importAction.loading,
    status,
    checkForUpdates: check.execute,
    acceptUpdates: importAction.execute,
  };
}
