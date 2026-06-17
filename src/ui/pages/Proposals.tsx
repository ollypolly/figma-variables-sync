import React, { useEffect, useState } from "react";
import { useGitHub } from "@ui/services/GitHubProvider";
import { PLUGIN } from "@common/networkSides";
import { UI_CHANNEL } from "@ui/app.network";
import { computeDiff, DiffItem } from "@ui/utils/diff";
import { PageContainer, PageHeader, PageContent, PageFooter } from "@ui/components/Layout";
import { DiffTable } from "@ui/components/DiffTable";
import { EmptyState } from "@ui/components/EmptyState";
import { Form, FormGroup, FormLabel, FormTextArea, FormAlert } from "@ui/components/Form";
import { Button } from "@ui/components/Button";
import { ProposalList, Proposal } from "@ui/components/ProposalList";

export const Proposals: React.FC = () => {
  const { config, service } = useGitHub();
  const [loading, setLoading] = useState(false);
  const [gitJson, setGitJson] = useState<string | null>(null);
  const [figmaJson, setFigmaJson] = useState<string | null>(null);
  const [diffItems, setDiffItems] = useState<DiffItem[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  
  const [prDescription, setPrDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ success: boolean; message: string } | null>(null);

  const fetchAndDiff = async () => {
    if (!service || !config) return;
    setLoading(true);
    setStatusMsg(null);
    try {
      // 1. Get tokens from Git
      const fileData = await service.getFile({
        owner: config.owner,
        repo: config.repo,
        filePath: config.filePath,
        branch: config.branch,
      });

      const gitContent = fileData ? fileData.content : "{}";
      setGitJson(gitContent);

      // 2. Get tokens from Figma
      const figmaContent = await UI_CHANNEL.request(PLUGIN, "exportLocalVariables", []);
      setFigmaJson(figmaContent);

      // 3. Compute Diff (outgoing proposals: target is figmaContent, source is gitContent)
      const diffs = computeDiff(figmaContent, gitContent, "proposals");
      setDiffItems(diffs);

      // 4. Fetch existing pull requests
      const prList = await service.listPullRequests(config.owner, config.repo, config.branch);
      setProposals(prList);
    } catch (e: any) {
      console.error(e);
      setStatusMsg({ success: false, message: e.message || "Failed to load variables diff or proposals." });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAndDiff();
  }, [config, service]);

  const handleSubmitProposal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!service || !config || !figmaJson) return;

    if (!prDescription.trim()) {
      setStatusMsg({ success: false, message: "Please enter a description for your proposal." });
      return;
    }

    setSubmitting(true);
    setStatusMsg(null);

    try {
      const branchName = `proposal-${Date.now()}`;
      
      // 1. Create a branch
      await service.createBranch(
        {
          owner: config.owner,
          repo: config.repo,
          filePath: config.filePath,
          branch: config.branch,
        },
        branchName
      );

      // 2. Commit the new variables file
      // Wait, we need to know the SHA of the file if it exists
      const fileData = await service.getFile({
        owner: config.owner,
        repo: config.repo,
        filePath: config.filePath,
        branch: config.branch,
      });
      const sha = fileData ? fileData.sha : undefined;
      
      const contentBase64 = btoa(figmaJson);
      
      await service.updateFile(
        {
          owner: config.owner,
          repo: config.repo,
          filePath: config.filePath,
          branch: config.branch,
        },
        prDescription,
        contentBase64,
        sha,
        branchName
      );

      // 3. Create Pull Request
      const pr = await service.createPullRequest(
        {
          owner: config.owner,
          repo: config.repo,
          filePath: config.filePath,
          branch: config.branch,
        },
        prDescription,
        `This proposal contains design variable changes exported from Figma.\n\nDescription: ${prDescription}`,
        branchName
      );

      setStatusMsg({
        success: true,
        message: `Proposal #${pr.number} successfully created!`,
      });
      
      setPrDescription("");
      
      // Re-fetch to clear diff and list new proposal
      await fetchAndDiff();
    } catch (err: any) {
      console.error(err);
      setStatusMsg({ success: false, message: err.message || "Failed to submit proposal." });
    } finally {
      setSubmitting(false);
    }
  };

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
        {statusMsg && (
          <div style={{ marginBottom: 16 }}>
            <FormAlert type={statusMsg.success ? "success" : "error"}>
              {statusMsg.message}
            </FormAlert>
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: "center", padding: 40, fontSize: 11, color: "var(--figma-color-text-secondary)" }}>
            Comparing local variables with repository...
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            {diffItems.length === 0 ? (
              <EmptyState
                title="No Changes Drafted"
                description="Your local variables match the repository. Edit your variables in Figma to draft a proposal."
                icon="✓"
                type="success"
              />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 8, color: "var(--figma-color-text)" }}>
                    Draft Proposal Changes ({diffItems.length})
                  </div>
                  <DiffTable items={diffItems} mode="proposals" />
                </div>

                <Form onSubmit={handleSubmitProposal}>
                  <FormGroup>
                    <FormLabel htmlFor="description">What changed in this proposal?</FormLabel>
                    <FormTextArea
                      id="description"
                      value={prDescription}
                      onChange={(e) => setPrDescription(e.target.value)}
                      placeholder="e.g. Adjusted dark-mode primary background color for contrast accessibility"
                      required
                      disabled={submitting}
                    />
                  </FormGroup>
                  <div>
                    <Button type="submit" variant="primary" disabled={submitting}>
                      {submitting ? "Submitting Proposal..." : "Propose Changes"}
                    </Button>
                  </div>
                </Form>
              </div>
            )}

            {proposals.length > 0 && (
              <div style={{ borderTop: "1px solid var(--figma-color-border)", paddingTop: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 12, color: "var(--figma-color-text)" }}>
                  Proposal Status
                </div>
                <ProposalList proposals={proposals} />
              </div>
            )}
          </div>
        )}
      </PageContent>
    </PageContainer>
  );
};
