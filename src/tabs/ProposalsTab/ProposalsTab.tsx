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
        <VerticalSpace space="medium" />

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Text>
            <Bold>Outgoing Changes</Bold>
          </Text>
          <Button onClick={checkForChanges} disabled={checking || submitting} secondary>
            {checking ? "Refreshing…" : "Refresh"}
          </Button>
        </div>

        <VerticalSpace space="medium" />

        <StatusBanner status={status} />

        {checking ? (
          <Fragment>
            <VerticalSpace space="small" />
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
            diffItems={diffItems}
            description={description}
            onDescriptionChange={setDescription}
            onSubmit={submitProposal}
            submitting={submitting}
          />
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
