import { Button, Container, VerticalSpace } from "@create-figma-plugin/ui";
import { Fragment, h } from "preact";
import { useState } from "preact/hooks";

import { WarningNotice } from "@components/WarningNotice";
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
    setActiveProposal,
    description,
    setDescription,
    submitting,
    status,
    collisionNotice,
    checkForChanges,
    submitProposal,
    exportPreviewJson,
    exportPreviewLoading,
    exportPreviewError,
    loadExportPreview,
  } = useProposals(active);

  const [previewOpen, setPreviewOpen] = useState(false);

  const showForm = !checking && diffItems.length > 0;
  const showTopArea = Boolean(collisionNotice || status || showForm);

  return (
    <TabGuard loading={settingsLoading} isConfigured={isConfigured}>
      <div class="flex flex-col h-full">
        <Container space="medium">
          <VerticalSpace space="small" />
          <PrSelector
            activeProposal={activeProposal}
            openProposals={openProposals}
            onSelect={setActiveProposal}
            disabled={submitting}
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
                <Button
                  secondary
                  onClick={() => {
                    setPreviewOpen(true);
                    loadExportPreview();
                  }}
                >
                  View export
                </Button>
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
    </TabGuard>
  );
}
