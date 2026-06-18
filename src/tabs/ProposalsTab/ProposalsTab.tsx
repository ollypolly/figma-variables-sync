import {
  Banner,
  Bold,
  Button,
  Container,
  Divider,
  IconCheck16,
  IconWarning16,
  LoadingIndicator,
  Muted,
  Text,
  VerticalSpace,
} from "@create-figma-plugin/ui";
import { Fragment, h } from "preact";

import { ProposalForm } from "./ProposalForm";
import { ProposalList } from "./ProposalList";
import { useProposals } from "./useProposals";

export function ProposalsTab() {
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
  } = useProposals();

  if (settingsLoading) {
    return (
      <Container space="medium">
        <VerticalSpace space="medium" />
        <Text>
          <Muted>Loading…</Muted>
        </Text>
      </Container>
    );
  }

  if (!isConfigured) {
    return (
      <Container space="medium">
        <VerticalSpace space="medium" />
        <Text>
          <Bold>Not configured</Bold>
        </Text>
        <VerticalSpace space="extraSmall" />
        <Text>
          <Muted>Set up your GitHub connection in the Settings tab.</Muted>
        </Text>
      </Container>
    );
  }

  return (
    <Container space="medium">
      <VerticalSpace space="medium" />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Text>
          <Bold>Outgoing Changes</Bold>
        </Text>
        <Button onClick={checkForChanges} disabled={checking || submitting} secondary>
          {checking ? "Checking…" : "Check Changes"}
        </Button>
      </div>

      <VerticalSpace space="medium" />

      {status && (
        <Fragment>
          <Banner
            icon={status.success ? <IconCheck16 /> : <IconWarning16 />}
            variant={status.success ? "success" : "warning"}
          >
            {status.text}
          </Banner>
          <VerticalSpace space="medium" />
        </Fragment>
      )}

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
  );
}
