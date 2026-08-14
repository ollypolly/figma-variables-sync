import { emit } from "@create-figma-plugin/utilities";
import { computed } from "nanostores";

import {
  DEFAULT_SETTINGS,
  type LoadSettingsHandler,
  type PluginSettings,
  type SaveSettingsHandler,
  type SettingsLoadedHandler,
} from "../types";
import { figmaPersistedAtom } from "./figmaPersistedAtom";

const { store: $settings, loaded: $settingsLoaded } = figmaPersistedAtom<
  PluginSettings,
  LoadSettingsHandler,
  SettingsLoadedHandler,
  SaveSettingsHandler
>(DEFAULT_SETTINGS, "LOAD_SETTINGS", "SETTINGS_LOADED", null);

export { $settings };

export const $settingsLoading = computed($settingsLoaded, (loaded) => !loaded);

export const $isConfigured = computed(
  $settings,
  (settings) => Boolean(settings.pat && settings.owner && settings.repo)
);

export function updateSettings(
  updater: PluginSettings | ((prev: PluginSettings) => PluginSettings)
): void {
  $settings.set(
    typeof updater === "function"
      ? (updater as (prev: PluginSettings) => PluginSettings)($settings.get())
      : updater
  );
}

export function saveSettings(): void {
  emit<SaveSettingsHandler>("SAVE_SETTINGS", $settings.get());
}
