import {
  Banner,
  Bold,
  Button,
  Container,
  Divider,
  IconCheck16,
  IconWarning16,
  Link,
  LoadingIndicator,
  Muted,
  Text,
  TextboxMultiline,
  VerticalSpace,
} from "@create-figma-plugin/ui";
import { Fragment, h } from "preact";

import { DiffList } from "@components/DiffList";
import { useProposals, type Proposal } from "./useProposals";

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
        <Fragment>
          <Text>
            <Muted>
              <Bold>{String(diffItems.length)}</Bold> change
              {diffItems.length === 1 ? "" : "s"} to propose:
            </Muted>
          </Text>
          <VerticalSpace space="small" />
          <DiffList items={diffItems} mode="proposals" />

          <VerticalSpace space="medium" />
          <Text>
            <Muted>Description</Muted>
          </Text>
          <VerticalSpace space="extraSmall" />
          <TextboxMultiline
            value={description}
            onValueInput={setDescription}
            placeholder="What changed in this proposal?"
            rows={3}
          />
          <VerticalSpace space="small" />
          <Button
            onClick={submitProposal}
            loading={submitting}
            disabled={!description.trim()}
            fullWidth
          >
            Propose Changes
          </Button>
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
  );
}

function ProposalList({ proposals }: { proposals: Proposal[] }) {
  return (
    <div>
      {proposals.map((pr, i) => (
        <div key={pr.number}>
          {i > 0 && <Divider />}
          <div style={{ padding: "6px 0" }}>
            <Text>
              <Link href={pr.html_url} target="_blank">
                #{pr.number}
              </Link>{" "}
              {pr.title}
            </Text>
            <VerticalSpace space="extraSmall" />
            <Text>
              <Muted>
                {pr.state === "merged"
                  ? "Merged"
                  : pr.state === "open"
                    ? "Open"
                    : "Closed"}
              </Muted>
            </Text>
          </div>
        </div>
      ))}
    </div>
  );
}
