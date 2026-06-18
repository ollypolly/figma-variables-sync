import { emit, on, showUI } from "@create-figma-plugin/utilities";
import { exportToDtcg } from "@common/dtcg";
import { importFromDtcg } from "@common/dtcg";

import type {
  RequestExportHandler,
  RequestImportHandler,
  ExportResultHandler,
  ImportResultHandler,
  LoadSettingsHandler,
  SaveSettingsHandler,
  SettingsLoadedHandler,
  SettingsSavedHandler,
  PluginSettings,
  ResizeWindowHandler,
} from "./types";

const SETTINGS_KEY = "figma-variables-sync-settings";

export default function () {
  on<RequestExportHandler>("REQUEST_EXPORT", function () {
    const collections = figma.variables.getLocalVariableCollections();
    const variables = figma.variables.getLocalVariables();
    const dtcgJson = exportToDtcg(collections, variables, figma);
    emit<ExportResultHandler>("EXPORT_RESULT", dtcgJson);
  });

  on<RequestImportHandler>("REQUEST_IMPORT", async function (dtcgJson) {
    try {
      await importFromDtcg(dtcgJson, figma);
      emit<ImportResultHandler>("IMPORT_RESULT", true, "Variables imported successfully.");
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Import failed.";
      emit<ImportResultHandler>("IMPORT_RESULT", false, message);
    }
  });

  on<LoadSettingsHandler>("LOAD_SETTINGS", async function () {
    const stored = await figma.clientStorage.getAsync(SETTINGS_KEY);
    const settings: PluginSettings = stored || {
      pat: "",
      owner: "",
      repo: "",
      filePath: "tokens/design-tokens.json",
      branch: "main",
    };
    emit<SettingsLoadedHandler>("SETTINGS_LOADED", settings);
  });

  on<SaveSettingsHandler>("SAVE_SETTINGS", async function (settings) {
    await figma.clientStorage.setAsync(SETTINGS_KEY, settings);
    emit<SettingsSavedHandler>("SETTINGS_SAVED");
  });

  on<ResizeWindowHandler>("RESIZE_WINDOW", function (windowSize) {
    figma.ui.resize(windowSize.width, windowSize.height);
  });

  showUI({ width: 480, height: 560 });
}
