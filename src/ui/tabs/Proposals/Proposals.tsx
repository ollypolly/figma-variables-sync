import React from "react";
import { PageContainer, PageHeader, PageContent } from "@ui/components/primitives/Layout";
import { DiffTable } from "@ui/components/business/DiffTable";
import { EmptyState } from "@ui/components/primitives/EmptyState";
import { Form, FormField, FormLabel, FormControl, FormMessage, FormAlert } from "@ui/components/primitives/Form";
import { Button } from "@ui/components/primitives/Button";
import { ProposalList } from "@ui/components/business/ProposalList";
import { Stack } from "@ui/components/primitives/Flex";
import { Text } from "@ui/components/primitives/Text";
import { useProposals } from "./useProposals";

export const Proposals: React.FC = () => {
  const {
    config,
    service,
    loading,
    diffItems,
    proposals,
    prDescription,
    submitting,
    statusMsg,
    fetchAndDiff,
    handleSubmitProposal,
  } = useProposals();

  if (!config || !service) {
    return (
      <PageContainer>
        <PageHeader title="Proposals" subtitle="Propose design system changes to code" />
        <PageContent>
          <EmptyState
            title="Not Configured"
            description="Please configure your GitHub credentials in settings to propose changes."
          />
        </PageContent>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title="Proposals"
        subtitle="Submit your local design variable edits as code proposals"
        actions={
          <Button onClick={fetchAndDiff} disabled={loading} variant="secondary">
            {loading ? "Checking..." : "Check Changes"}
          </Button>
        }
      />

      <PageContent>
        <Stack gap={16}>
          {statusMsg && (
            <FormAlert type={statusMsg.success ? "success" : "error"}>
              {statusMsg.message}
            </FormAlert>
          )}

          {loading ? (
            <Text size="11" color="secondary" as="div" className="loadingText">
              Comparing local variables with repository...
            </Text>
          ) : (
            <Stack gap={24}>
              {diffItems.length === 0 ? (
                <EmptyState
                  title="No Changes Drafted"
                  description="Your local variables match the repository. Edit your variables in Figma to draft a proposal."
                  icon="✓"
                  type="success"
                />
              ) : (
                <Stack gap={16}>
                  <Stack gap={8}>
                    <Text size="11" weight="semibold" color="primary" as="div">
                      Draft Proposal Changes ({diffItems.length})
                    </Text>
                    <DiffTable items={diffItems} mode="proposals" />
                  </Stack>

                  <Form onSubmit={handleSubmitProposal}>
                    <FormField name="description">
                      <FormLabel htmlFor="description">What changed in this proposal?</FormLabel>
                      <FormControl
                        as="textarea"
                        id="description"
                        value={prDescription}
                        placeholder="e.g. Adjusted dark-mode primary background color for contrast accessibility"
                        required
                        disabled={submitting}
                      />
                      <FormMessage match="valueMissing">Please enter a description for your proposal.</FormMessage>
                    </FormField>
                    <Button type="submit" variant="primary" disabled={submitting}>
                      {submitting ? "Submitting Proposal..." : "Propose Changes"}
                    </Button>
                  </Form>
                </Stack>
              )}

              {proposals.length > 0 && (
                <Stack gap={12} className="divider">
                  <Text size="11" weight="semibold" color="primary" as="div">
                    Proposal Status
                  </Text>
                  <ProposalList proposals={proposals} />
                </Stack>
              )}
            </Stack>
          )}
        </Stack>
      </PageContent>
    </PageContainer>
  );
};
