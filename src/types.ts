import { EventHandler } from "@create-figma-plugin/utilities";

// UI → Main
export interface RequestExportHandler extends EventHandler {
  name: "REQUEST_EXPORT";
  handler: () => void;
}

export interface RequestImportHandler extends EventHandler {
  name: "REQUEST_IMPORT";
  handler: (dtcgJson: string) => void;
}

export interface LoadSettingsHandler extends EventHandler {
  name: "LOAD_SETTINGS";
  handler: () => void;
}

export interface SaveSettingsHandler extends EventHandler {
  name: "SAVE_SETTINGS";
  handler: (settings: PluginSettings) => void;
}

export interface ResizeWindowHandler extends EventHandler {
  name: "RESIZE_WINDOW";
  handler: (windowSize: { width: number; height: number }) => void;
}

// Main → UI
export interface ExportResultHandler extends EventHandler {
  name: "EXPORT_RESULT";
  handler: (dtcgJson: string) => void;
}

export interface ImportResultHandler extends EventHandler {
  name: "IMPORT_RESULT";
  handler: (success: boolean, message: string) => void;
}

export interface SettingsLoadedHandler extends EventHandler {
  name: "SETTINGS_LOADED";
  handler: (settings: PluginSettings) => void;
}

export interface SettingsSavedHandler extends EventHandler {
  name: "SETTINGS_SAVED";
  handler: () => void;
}

// Shared types
export interface PluginSettings {
  pat: string;
  owner: string;
  repo: string;
  filePath: string;
  branch: string;
}

export const DEFAULT_SETTINGS: PluginSettings = {
  pat: "",
  owner: "",
  repo: "",
  filePath: "tokens/design-tokens.json",
  branch: "main",
};

export function trimSettings(settings: PluginSettings): PluginSettings {
  return Object.fromEntries(
    Object.entries(settings).map(([k, v]) => [k, typeof v === "string" ? v.trim() : v])
  ) as PluginSettings;
}
