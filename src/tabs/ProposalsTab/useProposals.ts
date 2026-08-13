import { useStore } from "@nanostores/preact";

import { $activeProposal } from "@stores/activeProposalStore";
import {
  $check,
  $checking,
  $conflictNotice,
  $description,
  $exportPreviewError,
  $exportPreviewJson,
  $exportPreviewLoading,
  $mergingBranch,
  $openProposals,
  $pendingSwitch,
  $resetting,
  $showStalenessNotice,
  $staleness,
  $status,
  $submitting,
  $switchLoading,
  abandonProposal,
  cancelSwitch,
  checkForChanges,
  dismissStaleness,
  loadExportPreview,
  requestSwitch,
  resetToGit,
  setDescription,
  submitProposal,
  updateBranch,
} from "@stores/proposalsStore";
import { $isConfigured, $settings, $settingsLoading } from "@stores/settingsStore";

export function useProposals() {
  const settings = useStore($settings);
  const settingsLoading = useStore($settingsLoading);
  const isConfigured = useStore($isConfigured);
  const activeProposal = useStore($activeProposal);

  const check = useStore($check);
  const checking = useStore($checking);
  const openProposals = useStore($openProposals);
  const pendingSwitch = useStore($pendingSwitch);
  const switchLoading = useStore($switchLoading);
  const staleness = useStore($staleness);
  const showStalenessNotice = useStore($showStalenessNotice);
  const conflictNotice = useStore($conflictNotice);
  const mergingBranch = useStore($mergingBranch);
  const description = useStore($description);
  const submitting = useStore($submitting);
  const status = useStore($status);
  const resetting = useStore($resetting);
  const exportPreviewJson = useStore($exportPreviewJson);
  const exportPreviewLoading = useStore($exportPreviewLoading);
  const exportPreviewError = useStore($exportPreviewError);

  return {
    settingsLoading,
    isConfigured,
    checking,
    diffItems: check?.diffs ?? [],
    primaryModeName: check?.primaryModeName ?? "Default",
    openProposals,
    activeProposal,
    requestSwitch,
    pendingSwitch,
    switchLoading,
    cancelSwitch,
    baseBranch: settings.branch,
    staleness,
    showStalenessNotice,
    dismissStaleness,
    conflictNotice,
    mergingBranch,
    updateBranch,
    abandonProposal,
    description,
    setDescription,
    submitting,
    status,
    collisionNotice: check?.collisionNotice ?? null,
    checkForChanges,
    submitProposal,
    resetting,
    resetToGit,
    exportPreviewJson,
    exportPreviewLoading,
    exportPreviewError,
    loadExportPreview,
  };
}
