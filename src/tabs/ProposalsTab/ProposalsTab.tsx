import {
  Bold,
  Button,
  Container,
  LoadingIndicator,
  Muted,
  Text,
  VerticalSpace,
} from "@create-figma-plugin/ui";
import { Fragment, h } from "preact";

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
    checkForChanges,
    submitProposal,
  } = useProposals(active);

  return (
    <TabGuard loading={settingsLoading} isConfigured={isConfigured}>
      <Container space="medium">
        <div
          class="sticky top-0 z-10 -mx-4 px-4"
          style={{ backgroundColor: "var(--figma-color-bg)" }}
        >
          <VerticalSpace space="small" />

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <Text>
              <Muted>
                {checking ? (
                  "Refreshing…"
                ) : (
                  <Fragment>
                    <Bold>{String(diffItems.length)}</Bold> change
                    {diffItems.length === 1 ? "" : "s"} to propose
                  </Fragment>
                )}
              </Muted>
            </Text>
            <Button onClick={checkForChanges} disabled={checking || submitting} secondary>
              Refresh
            </Button>
          </div>

          <VerticalSpace space="small" />

          <StatusBanner status={status} />

          {checking ? (
            <LoadingIndicator />
          ) : diffItems.length === 0 ? (
            <Text>
              <Muted>No local changes to propose.</Muted>
            </Text>
          ) : (
            <ProposalForm
              description={description}
              onDescriptionChange={setDescription}
              onSubmit={submitProposal}
              submitting={submitting}
            />
          )}

          <div
            class="-mx-4 mt-3"
            style={{ height: "1px", backgroundColor: "var(--figma-color-border)" }}
          />
        </div>

        {!checking && diffItems.length > 0 && (
          <Fragment>
            <VerticalSpace space="medium" />
            <DiffList items={diffItems} mode="proposals" />
          </Fragment>
        )}

        <VerticalSpace space="medium" />
      </Container>
    </TabGuard>
  );
}
