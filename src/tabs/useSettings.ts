import { emit, on } from "@create-figma-plugin/utilities";
import { useCallback, useEffect, useState } from "preact/hooks";

import { GitHubService } from "../services/github";
import {
  DEFAULT_SETTINGS,
  type LoadSettingsHandler,
  type PluginSettings,
  type SaveSettingsHandler,
  type SettingsLoadedHandler,
  type SettingsSavedHandler,
} from "../types";

export function useSettings() {
  const [settings, setSettings] = useState<PluginSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [status, setStatus] = useState<{
    success: boolean;
    text: string;
  } | null>(null);

  useEffect(() => {
    const cleanup = on<SettingsLoadedHandler>("SETTINGS_LOADED", (loaded) => {
      setSettings(loaded);
      setLoading(false);
    });
    emit<LoadSettingsHandler>("LOAD_SETTINGS");
    return cleanup;
  }, []);

  useEffect(() => {
    return on<SettingsSavedHandler>("SETTINGS_SAVED", () => {
      setSaving(false);
      setStatus({ success: true, text: "Settings saved." });
    });
  }, []);

  const updateField = useCallback((key: keyof PluginSettings) => {
    return (value: string) => {
      setSettings((s) => ({ ...s, [key]: value }));
      setStatus(null);
    };
  }, []);

  const handleSave = useCallback(() => {
    setSaving(true);
    setStatus(null);
    emit<SaveSettingsHandler>("SAVE_SETTINGS", settings);
  }, [settings]);

  const handleTestConnection = useCallback(async () => {
    const { pat, owner, repo } = settings;
    if (!pat || !owner || !repo) {
      setStatus({ success: false, text: "PAT, owner, and repository are required." });
      return;
    }

    setTesting(true);
    setStatus(null);

    try {
      const github = new GitHubService(pat);
      const connected = await github.verifyConnection(owner, repo);
      setStatus(
        connected
          ? { success: true, text: "Connected to GitHub." }
          : { success: false, text: "Could not access repository. Check permissions." }
      );
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Connection failed.";
      setStatus({ success: false, text: message });
    } finally {
      setTesting(false);
    }
  }, [settings]);

  return {
    settings,
    loading,
    saving,
    testing,
    status,
    updateField,
    handleSave,
    handleTestConnection,
  };
}
