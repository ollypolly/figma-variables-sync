import {
  Bold,
  Button,
  Container,
  Divider,
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
import { ProposalList } from "./ProposalList";
import { useProposals } from "./useProposals";

export function ProposalsTab({ active }: { active: boolean }) {
  const {
    settingsLoading,
    isConfigured,
    checking,
    diffItems,
    proposals,
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
        {/* Sticky: the CTA is the first thing designers should see and act on */}
        <div
          class="sticky top-0 z-10 -mx-4 px-4 pb-3"
          style={{ backgroundColor: "var(--figma-color-bg)" }}
        >
          <VerticalSpace space="small" />

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <Text>
              <Bold>Outgoing Changes</Bold>
            </Text>
            <Button onClick={checkForChanges} disabled={checking || submitting} secondary>
              {checking ? "Refreshing…" : "Refresh"}
            </Button>
          </div>

          <VerticalSpace space="small" />

          <StatusBanner status={status} />

          {checking ? (
            <Fragment>
              <LoadingIndicator />
              <VerticalSpace space="small" />
              <Text>
                <Muted>Comparing local variables with repository…</Muted>
              </Text>
            </Fragment>
          ) : diffItems.length === 0 ? (
            <Text>
              <Muted>No local changes to propose.</Muted>
            </Text>
          ) : (
            <ProposalForm
              changeCount={diffItems.length}
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
            <Text>
              <Bold>Changes</Bold>
            </Text>
            <VerticalSpace space="small" />
            <DiffList items={diffItems} mode="proposals" />
          </Fragment>
        )}

        {proposals.length > 0 && (
          <Fragment>
            <VerticalSpace space="large" />
            <Divider />
            <VerticalSpace space="medium" />
            <Text>
              <Bold>Recent Proposals</Bold>
            </Text>
            <VerticalSpace space="small" />
            <ProposalList proposals={proposals} />
          </Fragment>
        )}

        <VerticalSpace space="medium" />
      </Container>
    </TabGuard>
  );
}
