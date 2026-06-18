import { emit, on } from "@create-figma-plugin/utilities";
import { useCallback, useEffect, useState } from "preact/hooks";

import { computeDiff, type DiffItem } from "@common/diff";
import { GitHubService } from "@services/github";
import {
  DEFAULT_SETTINGS,
  type ExportResultHandler,
  type ImportResultHandler,
  type LoadSettingsHandler,
  type PluginSettings,
  type RequestExportHandler,
  type RequestImportHandler,
  type SettingsLoadedHandler,
} from "../../types";

function requestExport(): Promise<string> {
  return new Promise((resolve) => {
    const cleanup = on<ExportResultHandler>("EXPORT_RESULT", (json) => {
      cleanup();
      resolve(json);
    });
    emit<RequestExportHandler>("REQUEST_EXPORT");
  });
}

function requestImport(
  dtcgJson: string
): Promise<{ success: boolean; message: string }> {
  return new Promise((resolve) => {
    const cleanup = on<ImportResultHandler>(
      "IMPORT_RESULT",
      (success, message) => {
        cleanup();
        resolve({ success, message });
      }
    );
    emit<RequestImportHandler>("REQUEST_IMPORT", dtcgJson);
  });
}

export function useUpdates() {
  const [settings, setSettings] = useState<PluginSettings>(DEFAULT_SETTINGS);
  const [settingsLoading, setSettingsLoading] = useState(true);

  const [checking, setChecking] = useState(false);
  const [diffItems, setDiffItems] = useState<DiffItem[]>([]);
  const [gitJson, setGitJson] = useState<string | null>(null);

  const [importing, setImporting] = useState(false);
  const [status, setStatus] = useState<{
    success: boolean;
    text: string;
  } | null>(null);

  useEffect(() => {
    const cleanup = on<SettingsLoadedHandler>("SETTINGS_LOADED", (loaded) => {
      setSettings(loaded);
      setSettingsLoading(false);
    });
    emit<LoadSettingsHandler>("LOAD_SETTINGS");
    return cleanup;
  }, []);

  const isConfigured = Boolean(
    settings.pat && settings.owner && settings.repo
  );

  const checkForUpdates = useCallback(async () => {
    if (!isConfigured) return;
    setChecking(true);
    setStatus(null);
    setDiffItems([]);

    try {
      const github = new GitHubService(settings.pat);
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
  }, [settings, isConfigured]);

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
