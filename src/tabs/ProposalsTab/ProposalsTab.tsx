import { Button, Container, VerticalSpace } from "@create-figma-plugin/ui";
import { Fragment, h } from "preact";
import { useState } from "preact/hooks";

import { WarningNotice } from "@components/WarningNotice";
import { DiffBaseSwitchDialog } from "@components/DiffBaseSwitchDialog";
import { DiffList } from "@components/DiffList";
import { ExportPreviewModal } from "@components/ExportPreviewModal";
import { PrSelector } from "@components/PrSelector";
import { StatusBanner } from "@components/StatusBanner";
import { TabGuard } from "@components/TabGuard";
import { ProposalForm } from "./ProposalForm";
import { useProposals } from "./useProposals";

export function ProposalsTab({ active }: { active: boolean }) {
  const {
    settingsLoading,
    isConfigured,
    checking,
    diffItems,
    primaryModeName,
    openProposals,
    activeProposal,
    requestSwitch,
    pendingSwitch,
    switchLoading,
    cancelSwitch,
    description,
    setDescription,
    submitting,
    status,
    collisionNotice,
    checkForChanges,
    submitProposal,
    resetting,
    resetToGit,
    exportPreviewJson,
    exportPreviewLoading,
    exportPreviewError,
    loadExportPreview,
  } = useProposals(active);

  const [previewOpen, setPreviewOpen] = useState(false);
  const [confirmingSwitch, setConfirmingSwitch] = useState(false);

  const handleConfirmSwitch = async () => {
    if (!pendingSwitch) return;
    setConfirmingSwitch(true);
    try {
      await pendingSwitch.commit();
    } finally {
      setConfirmingSwitch(false);
    }
  };

  const showForm = !checking && diffItems.length > 0;
  const showTopArea = Boolean(collisionNotice || status || showForm);

  const handleReset = () => {
    const target = activeProposal ? `PR #${activeProposal.number}` : "main";
    const count = diffItems.length;
    if (window.confirm(`Discard all ${count} pending change${count === 1 ? "" : "s"} and reset Figma to match ${target}?`)) {
      resetToGit();
    }
  };

  return (
    <TabGuard loading={settingsLoading} isConfigured={isConfigured}>
      <div class="flex flex-col h-full">
        <Container space="medium">
          <VerticalSpace space="small" />
          <PrSelector
            activeProposal={activeProposal}
            openProposals={openProposals}
            onSelect={requestSwitch}
            disabled={submitting || switchLoading}
          />
          <VerticalSpace space="small" />
        </Container>

        <div style={{ height: "1px", backgroundColor: "var(--figma-color-border)" }} />

        {showTopArea && (
          <Fragment>
            <Container space="medium">
              <VerticalSpace space="small" />

              <div class="flex flex-col gap-4">
                {collisionNotice && (
                  <WarningNotice
                    message={collisionNotice.message}
                    resolution={collisionNotice.resolution}
                    details={{
                      paths: collisionNotice.paths,
                      fixInstructions: collisionNotice.fixInstructions,
                    }}
                  />
                )}

                <StatusBanner status={status} />

                {showForm && (
                  <ProposalForm
                    description={description}
                    onDescriptionChange={setDescription}
                    onSubmit={submitProposal}
                    submitting={submitting}
                    activeProposal={activeProposal}
                  />
                )}
              </div>

              <VerticalSpace space="small" />
            </Container>

            <div style={{ height: "1px", backgroundColor: "var(--figma-color-border)" }} />
          </Fragment>
        )}

        <div class="flex-1 min-h-0 overflow-y-auto">
          <Container space="extraSmall">
            <DiffList
              items={diffItems}
              mode="proposals"
              primaryModeName={primaryModeName}
              checking={checking}
              onRefresh={checkForChanges}
              refreshDisabled={submitting}
              emptyMessage="No local changes to propose."
              countLabel={(count) => (
                <Fragment>
                  <strong>{String(count)}</strong> change{count === 1 ? "" : "s"} to propose
                </Fragment>
              )}
              headerAction={
                <Fragment>
                  {diffItems.length > 0 && (
                    <Button secondary onClick={handleReset} loading={resetting} disabled={submitting}>
                      Reset
                    </Button>
                  )}
                  <Button
                    secondary
                    onClick={() => {
                      setPreviewOpen(true);
                      loadExportPreview();
                    }}
                  >
                    View export
                  </Button>
                </Fragment>
              }
            />
          </Container>
        </div>
      </div>
      <ExportPreviewModal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        json={exportPreviewJson ?? undefined}
        loading={exportPreviewLoading}
        error={exportPreviewError}
      />
      <DiffBaseSwitchDialog
        open={pendingSwitch !== null}
        targetLabel={pendingSwitch?.targetLabel ?? ""}
        count={pendingSwitch?.count ?? 0}
        loading={confirmingSwitch}
        onConfirm={handleConfirmSwitch}
        onCancel={cancelSwitch}
      />
    </TabGuard>
  );
}
