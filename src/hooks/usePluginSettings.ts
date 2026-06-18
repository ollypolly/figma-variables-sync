import { emit, on } from "@create-figma-plugin/utilities";
import { useEffect, useState } from "preact/hooks";

import {
  DEFAULT_SETTINGS,
  type LoadSettingsHandler,
  type PluginSettings,
  type SettingsLoadedHandler,
} from "../types";

export function usePluginSettings() {
  const [settings, setSettings] = useState<PluginSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const cleanup = on<SettingsLoadedHandler>("SETTINGS_LOADED", (loaded) => {
      setSettings(loaded);
      setLoading(false);
    });
    emit<LoadSettingsHandler>("LOAD_SETTINGS");
    return cleanup;
  }, []);

  const isConfigured = Boolean(
    settings.pat && settings.owner && settings.repo
  );

  return { settings, setSettings, loading, isConfigured };
}
