const SETTINGS_KEY = "figma-variables-sync-settings";
const ACTIVE_PROPOSAL_KEY = "figma-variables-sync-active-proposal";
const DRAFT_DESCRIPTION_KEY = "figma-variables-sync-draft-description";
const FILE_ID_PLUGIN_DATA_KEY = "variablesSyncFileId";

function currentFileId(): string {
  if (figma.fileKey) return figma.fileKey;
  let fileId = figma.root.getPluginData(FILE_ID_PLUGIN_DATA_KEY);
  if (!fileId) {
    fileId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    figma.root.setPluginData(FILE_ID_PLUGIN_DATA_KEY, fileId);
  }
  return fileId;
}

export const settingsKey = () => `${SETTINGS_KEY}:${currentFileId()}`;
export const activeProposalKey = () => `${ACTIVE_PROPOSAL_KEY}:${currentFileId()}`;
export const draftDescriptionKey = () => `${DRAFT_DESCRIPTION_KEY}:${currentFileId()}`;
