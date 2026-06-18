import {
  Banner,
  Bold,
  Button,
  Container,
  IconCheck16,
  IconWarning16,
  LoadingIndicator,
  Muted,
  Text,
  VerticalSpace,
} from "@create-figma-plugin/ui";
import { Fragment, h } from "preact";

import { DiffList } from "@components/DiffList";
import { useUpdates } from "./useUpdates";

export function UpdatesTab() {
  const {
    settingsLoading,
    isConfigured,
    checking,
    diffItems,
    importing,
    status,
    checkForUpdates,
    acceptUpdates,
  } = useUpdates();

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
          <Bold>Incoming Updates</Bold>
        </Text>
        <Button onClick={checkForUpdates} disabled={checking || importing} secondary>
          {checking ? "Checking…" : "Check for Updates"}
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
          <Muted>All variables are up to date.</Muted>
        </Text>
      ) : (
        <Fragment>
          <Text>
            <Muted>
              <Bold>{String(diffItems.length)}</Bold> update
              {diffItems.length === 1 ? "" : "s"} available:
            </Muted>
          </Text>
          <VerticalSpace space="small" />
          <DiffList items={diffItems} mode="updates" />
          <VerticalSpace space="medium" />
          <Button onClick={acceptUpdates} loading={importing} fullWidth>
            Accept Updates
          </Button>
        </Fragment>
      )}

      <VerticalSpace space="medium" />
    </Container>
  );
}
