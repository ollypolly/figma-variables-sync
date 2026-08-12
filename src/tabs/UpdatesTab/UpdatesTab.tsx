import { Button, Container, VerticalSpace } from "@create-figma-plugin/ui";
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
        <StatusBanner status={status} />
        <VerticalSpace space="medium" />
      </Container>

      <Container space="extraSmall">
        <DiffList
          items={diffItems}
          mode="updates"
          checking={checking}
          onRefresh={checkForUpdates}
          refreshDisabled={importing}
          emptyMessage="All variables are up to date."
          countLabel={(count) => (
            <Fragment>
              <strong>{String(count)}</strong> update{count === 1 ? "" : "s"} available
            </Fragment>
          )}
        />
      </Container>

      {!checking && diffItems.length > 0 && (
        <Container space="medium">
          <VerticalSpace space="medium" />
          <Button onClick={acceptUpdates} loading={importing} fullWidth>
            Accept Updates
          </Button>
          <VerticalSpace space="medium" />
        </Container>
      )}
    </TabGuard>
  );
}
