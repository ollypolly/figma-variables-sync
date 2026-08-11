import { Container, VerticalSpace } from "@create-figma-plugin/ui";
import { Fragment, h } from "preact";

import { ContactEngineerNotice } from "@components/ContactEngineerNotice";
import { DiffList } from "@components/DiffList";
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
    description,
    setDescription,
    submitting,
    status,
    collisionNotice,
    checkForChanges,
    submitProposal,
  } = useProposals(active);

  const showForm = !checking && diffItems.length > 0;
  const showTopArea = Boolean(collisionNotice || status || showForm);

  return (
    <TabGuard loading={settingsLoading} isConfigured={isConfigured}>
      <div class="flex flex-col h-full">
        {showTopArea && (
          <Fragment>
            <Container space="medium">
              <VerticalSpace space="small" />

              {collisionNotice && (
                <ContactEngineerNotice
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
                />
              )}

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
              checking={checking}
              onRefresh={checkForChanges}
              refreshDisabled={submitting}
              emptyMessage="No local changes to propose."
              countLabel={(count) => (
                <Fragment>
                  <strong>{String(count)}</strong> change{count === 1 ? "" : "s"} to propose
                </Fragment>
              )}
            />
          </Container>
        </div>
      </div>
    </TabGuard>
  );
}
