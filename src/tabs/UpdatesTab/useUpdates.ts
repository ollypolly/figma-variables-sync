import { useCallback, useEffect, useState } from "preact/hooks";

import { computeDiff, type DiffItem } from "@common/diff";
import { useGitHub } from "../../hooks/useGitHub";
import { usePluginSettings } from "../../hooks/usePluginSettings";
import { requestExport, requestImport } from "@services/figmaMessages";

export function useUpdates() {
  const { settings, loading: settingsLoading, isConfigured } = usePluginSettings();
  const github = useGitHub(settings);

  const [checking, setChecking] = useState(false);
  const [diffItems, setDiffItems] = useState<DiffItem[]>([]);
  const [gitJson, setGitJson] = useState<string | null>(null);

  const [importing, setImporting] = useState(false);
  const [status, setStatus] = useState<{
    success: boolean;
    text: string;
  } | null>(null);

  const checkForUpdates = useCallback(async () => {
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
      setGitJson(gitContent);

      const figmaContent = await requestExport();
      const diffs = computeDiff(figmaContent, gitContent, "updates");
      setDiffItems(diffs);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to check for updates.";
      setStatus({ success: false, text: message });
    } finally {
      setChecking(false);
    }
  }, [settings, isConfigured, github]);

  useEffect(() => {
    if (!settingsLoading && isConfigured) {
      checkForUpdates();
    }
  }, [settingsLoading]);

  const acceptUpdates = useCallback(async () => {
    if (!gitJson) return;
    setImporting(true);
    setStatus(null);

    try {
      const result = await requestImport(gitJson);
      if (result.success) {
        setStatus({ success: true, text: result.message });
        await checkForUpdates();
      } else {
        setStatus({ success: false, text: result.message });
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Import failed.";
      setStatus({ success: false, text: message });
    } finally {
      setImporting(false);
    }
  }, [gitJson, checkForUpdates]);

  return {
    settingsLoading,
    isConfigured,
    checking,
    diffItems,
    importing,
    status,
    checkForUpdates,
    acceptUpdates,
  };
}
