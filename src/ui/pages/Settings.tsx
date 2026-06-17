import React, { useState } from "react";
import { useGitHub } from "@ui/services/GitHubProvider";
import {
  Form,
  FormSectionTitle,
  FormDescription,
  FormGroup,
  FormRow,
  FormLabel,
  FormInput,
  FormHint,
  FormAlert,
} from "@ui/components/Form";
import { Button, ButtonGroup } from "@ui/components/Button";
import { PageContainer, PageContent, PageHeader } from "@ui/components/Layout";

export const Settings: React.FC = () => {
  const { config, saveConfig, service } = useGitHub();
  const [pat, setPat] = useState(config?.pat || "");
  const [owner, setOwner] = useState(config?.owner || "");
  const [repo, setRepo] = useState(config?.repo || "");
  const [filePath, setFilePath] = useState(config?.filePath || "tokens/design-tokens.json");
  const [branch, setBranch] = useState(config?.branch || "main");

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    saveConfig({ pat, owner, repo, filePath, branch });
    setTestResult({ success: true, message: "Settings saved successfully!" });
  };

  const handleTestConnection = async () => {
    if (!pat || !owner || !repo) {
      setTestResult({ success: false, message: "Please fill in Token, Owner, and Repository coordinates." });
      return;
    }

    setTesting(true);
    setTestResult(null);

    try {
      const testService = service || new (await import("@ui/services/github")).GitHubService(pat);
      const isConnected = await testService.verifyConnection(owner, repo);
      if (isConnected) {
        setTestResult({ success: true, message: "Connected successfully to GitHub!" });
      } else {
        setTestResult({ success: false, message: "Failed to connect. Check repository permissions." });
      }
    } catch (e: any) {
      setTestResult({ success: false, message: e.message || "Connection failed. Please check your PAT and settings." });
    } finally {
      setTesting(false);
    }
  };

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

          <FormGroup>
            <FormLabel>Personal Access Token (PAT)</FormLabel>
            <FormInput
              type="password"
              value={pat}
              onChange={(e) => setPat(e.target.value)}
              placeholder="github_pat_..."
              required
            />
            <FormHint>
              Requires `Contents: write` and `Pull requests: write` scopes for the selected repository.
            </FormHint>
          </FormGroup>

          <FormRow>
            <FormGroup>
              <FormLabel>Repository Owner</FormLabel>
              <FormInput
                type="text"
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
                placeholder="e.g. facebook"
                required
              />
            </FormGroup>

            <FormGroup>
              <FormLabel>Repository Name</FormLabel>
              <FormInput
                type="text"
                value={repo}
                onChange={(e) => setRepo(e.target.value)}
                placeholder="e.g. design-system"
                required
              />
            </FormGroup>
          </FormRow>

          <FormGroup>
            <FormLabel>Tokens File Path</FormLabel>
            <FormInput
              type="text"
              value={filePath}
              onChange={(e) => setFilePath(e.target.value)}
              placeholder="tokens/design-tokens.json"
              required
            />
          </FormGroup>

          <FormGroup>
            <FormLabel>Sync Target Branch</FormLabel>
            <FormInput
              type="text"
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              placeholder="main"
              required
            />
          </FormGroup>

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
