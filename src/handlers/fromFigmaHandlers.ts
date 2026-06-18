import { emit, on } from "@create-figma-plugin/utilities";
import { exportToDtcg } from "@common/dtcg";

import {
  DEFAULT_SETTINGS,
  type ExportResultHandler,
  type LoadSettingsHandler,
  type PluginSettings,
  type RequestExportHandler,
  type SettingsLoadedHandler,
} from "../types";

const SETTINGS_KEY = "figma-variables-sync-settings";

export function registerFromFigmaHandlers() {
  on<RequestExportHandler>("REQUEST_EXPORT", function () {
    const collections = figma.variables.getLocalVariableCollections();
    const variables = figma.variables.getLocalVariables();
    const dtcgJson = exportToDtcg(collections, variables, figma);
    emit<ExportResultHandler>("EXPORT_RESULT", dtcgJson);
  });

  on<LoadSettingsHandler>("LOAD_SETTINGS", async function () {
    const stored = await figma.clientStorage.getAsync(SETTINGS_KEY);
    const settings: PluginSettings = { ...DEFAULT_SETTINGS, ...stored };
    emit<SettingsLoadedHandler>("SETTINGS_LOADED", settings);
  });
}
