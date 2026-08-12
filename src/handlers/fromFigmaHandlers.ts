import { emit, on } from "@create-figma-plugin/utilities";
import { exportToDtcg, NamingCollisionError } from "@common/dtcg";

import {
  DEFAULT_SETTINGS,
  trimSettings,
  type ActiveProposalLoadedHandler,
  type DraftDescriptionLoadedHandler,
  type ExportResultHandler,
  type LoadActiveProposalHandler,
  type LoadDraftDescriptionHandler,
  type LoadSettingsHandler,
  type PluginSettings,
  type RequestExportHandler,
  type SettingsLoadedHandler,
} from "../types";

const SETTINGS_KEY = "figma-variables-sync-settings";
const ACTIVE_PROPOSAL_KEY = "figma-variables-sync-active-proposal";
const DRAFT_DESCRIPTION_KEY = "figma-variables-sync-draft-description";

export function registerFromFigmaHandlers() {
  on<RequestExportHandler>("REQUEST_EXPORT", function () {
    try {
      const collections = figma.variables.getLocalVariableCollections();
      const variables = figma.variables.getLocalVariables();
      const dtcgJson = exportToDtcg(collections, variables, figma);
      emit<ExportResultHandler>("EXPORT_RESULT", true, dtcgJson);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Export failed.";
      const collidingPaths = e instanceof NamingCollisionError ? e.collidingPaths : undefined;
      emit<ExportResultHandler>("EXPORT_RESULT", false, "", message, collidingPaths);
    }
  });

  on<LoadSettingsHandler>("LOAD_SETTINGS", async function () {
    const stored = await figma.clientStorage.getAsync(SETTINGS_KEY);
    const settings = trimSettings({ ...DEFAULT_SETTINGS, ...stored });
    emit<SettingsLoadedHandler>("SETTINGS_LOADED", settings);
  });

  on<LoadActiveProposalHandler>("LOAD_ACTIVE_PROPOSAL", async function () {
    const stored = await figma.clientStorage.getAsync(ACTIVE_PROPOSAL_KEY);
    emit<ActiveProposalLoadedHandler>("ACTIVE_PROPOSAL_LOADED", stored ?? null);
  });

  on<LoadDraftDescriptionHandler>("LOAD_DRAFT_DESCRIPTION", async function () {
    const stored = await figma.clientStorage.getAsync(DRAFT_DESCRIPTION_KEY);
    emit<DraftDescriptionLoadedHandler>("DRAFT_DESCRIPTION_LOADED", stored ?? "");
  });
}
