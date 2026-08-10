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

        {!checking && diffItems.length > 0 && (
          <Fragment>
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
