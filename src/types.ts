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

export interface LoadActiveProposalHandler extends EventHandler {
  name: "LOAD_ACTIVE_PROPOSAL";
  handler: () => void;
}

export interface SaveActiveProposalHandler extends EventHandler {
  name: "SAVE_ACTIVE_PROPOSAL";
  handler: (activeProposal: ActiveProposal | null) => void;
}

export interface ResizeWindowHandler extends EventHandler {
  name: "RESIZE_WINDOW";
  handler: (windowSize: { width: number; height: number }) => void;
}

// Main → UI
export interface ExportResultHandler extends EventHandler {
  name: "EXPORT_RESULT";
  handler: (
    success: boolean,
    dtcgJson: string,
    error?: string,
    collidingPaths?: string[]
  ) => void;
}

export interface ImportResultHandler extends EventHandler {
  name: "IMPORT_RESULT";
  handler: (success: boolean, message: string, quarantined?: string[]) => void;
}

export interface SettingsLoadedHandler extends EventHandler {
  name: "SETTINGS_LOADED";
  handler: (settings: PluginSettings) => void;
}

export interface SettingsSavedHandler extends EventHandler {
  name: "SETTINGS_SAVED";
  handler: () => void;
}

export interface ActiveProposalLoadedHandler extends EventHandler {
  name: "ACTIVE_PROPOSAL_LOADED";
  handler: (activeProposal: ActiveProposal | null) => void;
}

// Shared types
export interface ActiveProposal {
  number: number;
  title: string;
  html_url: string;
  head_ref: string;
}

export interface PluginSettings {
  pat: string;
  owner: string;
  repo: string;
  filePath: string;
  branch: string;
  prLabels: string; // comma-separated; see parsePrLabels()
}

export const DEFAULT_SETTINGS: PluginSettings = {
  pat: "",
  owner: "",
  repo: "",
  filePath: "tokens/design-tokens.json",
  branch: "main",
  prLabels: "",
};

export function trimSettings(settings: PluginSettings): PluginSettings {
  return Object.fromEntries(
    Object.entries(settings).map(([k, v]) => [k, typeof v === "string" ? v.trim() : v])
  ) as PluginSettings;
}

export function parsePrLabels(prLabels: string): string[] {
  return prLabels
    .split(",")
    .map((label) => label.trim())
    .filter(Boolean);
}
