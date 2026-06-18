import { emit, on } from "@create-figma-plugin/utilities";
import { useCallback, useEffect, useState } from "preact/hooks";

import { useAsync } from "@hooks/useAsync";
import { useGitHub } from "@hooks/useGitHub";
import { usePluginSettings } from "@hooks/usePluginSettings";
import type {
  PluginSettings,
  SaveSettingsHandler,
  SettingsSavedHandler,
} from "../../types";

export function useSettings() {
  const { settings, setSettings, loading } = usePluginSettings();
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
      setSettings((s) => ({ ...s, [key]: value }));
      setSaveStatus(null);
    };
  }, []);

  const handleSave = useCallback(() => {
    setSaving(true);
    setSaveStatus(null);
    emit<SaveSettingsHandler>("SAVE_SETTINGS", settings);
  }, [settings]);

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
    handleSave,
    handleTestConnection: testConnection.execute,
  };
}
