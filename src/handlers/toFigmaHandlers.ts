import { emit, on } from "@create-figma-plugin/utilities";
import { importFromDtcg } from "@common/dtcg";

import type {
  ImportResultHandler,
  RequestImportHandler,
  ResizeWindowHandler,
  SaveSettingsHandler,
  SettingsSavedHandler,
} from "../types";

const SETTINGS_KEY = "figma-variables-sync-settings";

export function registerToFigmaHandlers() {
  on<RequestImportHandler>("REQUEST_IMPORT", async function (dtcgJson) {
    try {
      await importFromDtcg(dtcgJson, figma);
      emit<ImportResultHandler>("IMPORT_RESULT", true, "Variables imported successfully.");
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Import failed.";
      emit<ImportResultHandler>("IMPORT_RESULT", false, message);
    }
  });

  on<SaveSettingsHandler>("SAVE_SETTINGS", async function (settings) {
    await figma.clientStorage.setAsync(SETTINGS_KEY, settings);
    emit<SettingsSavedHandler>("SETTINGS_SAVED");
  });

  on<ResizeWindowHandler>("RESIZE_WINDOW", function (windowSize) {
    figma.ui.resize(windowSize.width, windowSize.height);
  });
}
