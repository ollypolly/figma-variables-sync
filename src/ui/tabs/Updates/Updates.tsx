import React from "react";
import { PageContainer, PageHeader, PageContent, PageFooter } from "@ui/components/primitives/Layout";
import { DiffTable } from "@ui/components/business/DiffTable";
import { EmptyState } from "@ui/components/primitives/EmptyState";
import { FormAlert } from "@ui/components/primitives/Form";
import { Button } from "@ui/components/primitives/Button";
import { Stack } from "@ui/components/primitives/Flex";
import { Text } from "@ui/components/primitives/Text";
import { useUpdates } from "./useUpdates";

export const Updates: React.FC = () => {
  const {
    config,
    service,
    loading,
    diffItems,
    statusMsg,
    fetchAndDiff,
    handleAcceptUpdates,
  } = useUpdates();

  if (!config || !service) {
    return (
      <PageContainer>
        <PageHeader title="Updates" subtitle="Incoming design token updates from GitHub" />
        <PageContent>
          <EmptyState
            title="Not Configured"
            description="Please configure your GitHub credentials in settings to sync updates."
          />
        </PageContent>
      </PageContainer>
    );
  }

  const headerActions = (
    <Button onClick={fetchAndDiff} disabled={loading} variant="secondary">
      {loading ? "Checking..." : "Check for Updates"}
    </Button>
  );

  return (
    <PageContainer>
      <PageHeader
        title="Updates"
        subtitle={`Incoming design token updates from branch '${config.branch}'`}
        actions={headerActions}
      />

      <PageContent>
        <Stack gap={12}>
          {statusMsg && (
            <FormAlert type={statusMsg.success ? "success" : "error"}>
              {statusMsg.message}
            </FormAlert>
          )}

          {loading ? (
            <Text size="11" color="secondary" as="div" className="loadingText">
              Comparing local variables with repository...
            </Text>
          ) : diffItems.length === 0 ? (
            <EmptyState
              title="Up to Date"
              description={
                <>
                  All Figma variables match the target file on branch <strong>{config.branch}</strong>.
                </>
              }
              icon="✓"
              type="success"
            />
          ) : (
            <Stack gap={12} grow>
              <Text size="11" color="secondary" as="div">
                <strong>{diffItems.length}</strong> updates available to import:
              </Text>
              <DiffTable items={diffItems} mode="updates" />
            </Stack>
          )}
        </Stack>
      </PageContent>

      {!loading && diffItems.length > 0 && (
        <PageFooter>
          <Button onClick={handleAcceptUpdates} disabled={loading} variant="primary">
            Accept Updates
          </Button>
        </PageFooter>
      )}
    </PageContainer>
  );
};
