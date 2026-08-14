import { on } from "@create-figma-plugin/utilities";
import { useStore } from "@nanostores/preact";
import { useCallback, useEffect, useState } from "preact/hooks";

import { useAsync } from "@hooks/useAsync";
import { useGitHub } from "@hooks/useGitHub";
import { $settings, $settingsLoading, saveSettings, updateSettings } from "@stores/settingsStore";
import type { PluginSettings, SettingsSavedHandler } from "../../types";

export function useSettings() {
  const settings = useStore($settings);
  const loading = useStore($settingsLoading);
  const github = useGitHub(settings);

  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<{
    success: boolean;
    text: string;
  } | null>(null);

  useEffect(() => {
    return on<SettingsSavedHandler>("SETTINGS_SAVED", () => {
      setSaving(false);
      setSaveStatus({ success: true, text: "Settings saved." });
    });
  }, []);

  const updateField = useCallback((key: keyof PluginSettings) => {
    return (value: string) => {
      updateSettings((s) => ({ ...s, [key]: value }));
      setSaveStatus(null);
    };
  }, []);

  const updateBooleanField = useCallback((key: "skipSwitchConfirmation") => {
    return (value: boolean) => {
      updateSettings((s) => ({ ...s, [key]: value }));
      setSaveStatus(null);
    };
  }, []);

  const handleSave = useCallback(() => {
    setSaving(true);
    setSaveStatus(null);
    saveSettings();
  }, []);

  const testConnection = useAsync<string>(
    useCallback(async () => {
      const { pat, owner, repo } = settings;
      if (!pat || !owner || !repo) {
        throw new Error("PAT, owner, and repository are required.");
      }
      if (!github) throw new Error("Not configured.");

      const connected = await github.verifyConnection(owner, repo);
      if (!connected) {
        throw new Error("Could not access repository. Check permissions.");
      }
      return "Connected to GitHub.";
    }, [settings, github])
  );

  const status = saveStatus
    ?? (testConnection.error
      ? { success: false, text: testConnection.error }
      : testConnection.data
        ? { success: true, text: testConnection.data }
        : null);

  return {
    settings,
    loading,
    saving,
    testing: testConnection.loading,
    status,
    updateField,
    updateBooleanField,
    handleSave,
    handleTestConnection: testConnection.execute,
  };
}
