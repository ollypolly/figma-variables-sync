import React, { useEffect, useState } from "react";
import { useGitHub } from "@ui/services/GitHubProvider";
import { PLUGIN } from "@common/networkSides";
import { UI_CHANNEL } from "@ui/app.network";
import { computeDiff, DiffItem } from "@ui/utils/diff";
import { PageContainer, PageHeader, PageContent, PageFooter } from "@ui/components/Layout";
import { DiffTable } from "@ui/components/DiffTable";
import { EmptyState } from "@ui/components/EmptyState";
import { FormAlert } from "@ui/components/Form";
import { Button } from "@ui/components/Button";

export const Updates: React.FC = () => {
  const { config, service } = useGitHub();
  const [loading, setLoading] = useState(false);
  const [gitJson, setGitJson] = useState<string | null>(null);
  const [figmaJson, setFigmaJson] = useState<string | null>(null);
  const [diffItems, setDiffItems] = useState<DiffItem[]>([]);
  const [statusMsg, setStatusMsg] = useState<{ success: boolean; message: string } | null>(null);

  const fetchAndDiff = async () => {
    if (!service || !config) return;
    setLoading(true);
    setStatusMsg(null);
    try {
      const fileData = await service.getFile({
        owner: config.owner,
        repo: config.repo,
        filePath: config.filePath,
        branch: config.branch,
      });

      const gitContent = fileData ? fileData.content : "{}";
      setGitJson(gitContent);

      const figmaContent = await UI_CHANNEL.request(PLUGIN, "exportLocalVariables", []);
      setFigmaJson(figmaContent);

      const diffs = computeDiff(figmaContent, gitContent, "updates");
      setDiffItems(diffs);
    } catch (e: any) {
      console.error(e);
      setStatusMsg({ success: false, message: e.message || "Failed to load variables from GitHub." });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAndDiff();
  }, [config, service]);

  const handleAcceptUpdates = async () => {
    if (!gitJson) return;
    setLoading(true);
    try {
      await UI_CHANNEL.request(PLUGIN, "importLocalVariables", [gitJson]);
      setStatusMsg({ success: true, message: "Variables successfully updated in Figma!" });
      await fetchAndDiff();
    } catch (e: any) {
      console.error(e);
      setStatusMsg({ success: false, message: e.message || "Failed to import variables to Figma." });
      setLoading(false);
    }
  };

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
        {statusMsg && (
          <div style={{ marginBottom: 12 }}>
            <FormAlert type={statusMsg.success ? "success" : "error"}>
              {statusMsg.message}
            </FormAlert>
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: "center", padding: 40, fontSize: 11, color: "var(--figma-color-text-secondary)" }}>
            Comparing local variables with repository...
          </div>
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
          <div style={{ display: "flex", flexDirection: "column", gap: 12, flex: 1 }}>
            <div style={{ fontSize: 11, color: "var(--figma-color-text-secondary)" }}>
              <strong>{diffItems.length}</strong> updates available to import:
            </div>
            <DiffTable items={diffItems} mode="updates" />
          </div>
        )}
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
