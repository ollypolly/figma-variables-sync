import { emit, on } from "@create-figma-plugin/utilities";
import { importFromDtcg } from "@common/dtcg";

import {
  trimSettings,
  type ImportResultHandler,
  type RequestImportHandler,
  type ResizeWindowHandler,
  type SaveActiveProposalHandler,
  type SaveDraftDescriptionHandler,
  type SaveSettingsHandler,
  type SettingsSavedHandler,
} from "../types";

const SETTINGS_KEY = "figma-variables-sync-settings";
const ACTIVE_PROPOSAL_KEY = "figma-variables-sync-active-proposal";
const DRAFT_DESCRIPTION_KEY = "figma-variables-sync-draft-description";

export function registerToFigmaHandlers() {
  on<RequestImportHandler>("REQUEST_IMPORT", async function (dtcgJson) {
    try {
      const { quarantined } = await importFromDtcg(dtcgJson, figma);
      emit<ImportResultHandler>(
        "IMPORT_RESULT",
        true,
        "Variables imported successfully.",
        quarantined
      );
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Import failed.";
      emit<ImportResultHandler>("IMPORT_RESULT", false, message);
    }
  });

  on<SaveSettingsHandler>("SAVE_SETTINGS", async function (settings) {
    await figma.clientStorage.setAsync(SETTINGS_KEY, trimSettings(settings));
    emit<SettingsSavedHandler>("SETTINGS_SAVED");
  });

  on<SaveActiveProposalHandler>("SAVE_ACTIVE_PROPOSAL", async function (activeProposal) {
    await figma.clientStorage.setAsync(ACTIVE_PROPOSAL_KEY, activeProposal);
  });

  on<SaveDraftDescriptionHandler>("SAVE_DRAFT_DESCRIPTION", async function (description) {
    await figma.clientStorage.setAsync(DRAFT_DESCRIPTION_KEY, description);
  });

  on<ResizeWindowHandler>("RESIZE_WINDOW", function (windowSize) {
    figma.ui.resize(windowSize.width, windowSize.height);
  });
}
