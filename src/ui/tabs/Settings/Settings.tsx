import React from "react";
import {
  Form,
  FormSectionTitle,
  FormDescription,
  FormField,
  FormLabel,
  FormControl,
  FormMessage,
  FormHint,
  FormAlert,
} from "@ui/components/primitives/Form";
import { Button, ButtonGroup } from "@ui/components/Button";
import { PageContainer, PageContent, PageHeader } from "@ui/components/Layout";
import { Group } from "@ui/components/primitives/Flex/Flex";
import { useSettingsForm } from "./useSettingsForm";

export const Settings: React.FC = () => {
  const {
    pat,
    setPat,
    owner,
    setOwner,
    repo,
    setRepo,
    filePath,
    setFilePath,
    branch,
    setBranch,
    testing,
    testResult,
    handleSave,
    handleTestConnection,
  } = useSettingsForm();

  return (
    <PageContainer>
      <PageHeader
        title="Settings"
        subtitle="Manage authorization and repository coordinates"
      />
      <PageContent>
        <Form onSubmit={handleSave}>
          <FormSectionTitle>GitHub Configuration</FormSectionTitle>
          <FormDescription>
            Configure your GitHub Fine-Grained Personal Access Token (PAT) and target repository coordinates to sync design variables.
          </FormDescription>

          <FormField name="pat">
            <FormLabel>Personal Access Token (PAT)</FormLabel>
            <FormControl
              type="password"
              value={pat}
              onChange={(e) => setPat(e.target.value)}
              placeholder="github_pat_..."
              required
            />
            <FormMessage match="valueMissing">Personal Access Token is required</FormMessage>
            <FormHint>
              Requires `Contents: write` and `Pull requests: write` scopes for the selected repository.
            </FormHint>
          </FormField>

          <Group gap={12} align="flex-start" width="100%">
            <FormField name="owner" grow>
              <FormLabel>Repository Owner</FormLabel>
              <FormControl
                type="text"
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
                placeholder="e.g. facebook"
                required
              />
              <FormMessage match="valueMissing">Repository owner is required</FormMessage>
            </FormField>

            <FormField name="repo" grow>
              <FormLabel>Repository Name</FormLabel>
              <FormControl
                type="text"
                value={repo}
                onChange={(e) => setRepo(e.target.value)}
                placeholder="e.g. design-system"
                required
              />
              <FormMessage match="valueMissing">Repository name is required</FormMessage>
            </FormField>
          </Group>

          <FormField name="filePath">
            <FormLabel>Tokens File Path</FormLabel>
            <FormControl
              type="text"
              value={filePath}
              onChange={(e) => setFilePath(e.target.value)}
              placeholder="tokens/design-tokens.json"
              required
            />
            <FormMessage match="valueMissing">Tokens file path is required</FormMessage>
          </FormField>

          <FormField name="branch">
            <FormLabel>Sync Target Branch</FormLabel>
            <FormControl
              type="text"
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              placeholder="main"
              required
            />
            <FormMessage match="valueMissing">Sync target branch is required</FormMessage>
          </FormField>

          <ButtonGroup>
            <Button type="submit" variant="primary">
              Save Configuration
            </Button>
            <Button
              type="button"
              onClick={handleTestConnection}
              disabled={testing}
              variant="secondary"
            >
              {testing ? "Testing..." : "Test Connection"}
            </Button>
          </ButtonGroup>

          {testResult && (
            <FormAlert type={testResult.success ? "success" : "error"}>
              {testResult.message}
            </FormAlert>
          )}
        </Form>
      </PageContent>
    </PageContainer>
  );
};
