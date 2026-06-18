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
import { useUpdates } from "./useUpdates";

export function UpdatesTab({ active }: { active: boolean }) {
  const {
    settingsLoading,
    isConfigured,
    checking,
    diffItems,
    importing,
    status,
    checkForUpdates,
    acceptUpdates,
  } = useUpdates(active);

  return (
    <TabGuard loading={settingsLoading} isConfigured={isConfigured}>
      <Container space="medium">
        <VerticalSpace space="medium" />

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Text>
            <Bold>Incoming Updates</Bold>
          </Text>
          <Button onClick={checkForUpdates} disabled={checking || importing} secondary>
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
    </TabGuard>
  );
}
