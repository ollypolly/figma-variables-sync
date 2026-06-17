import { useEffect, useState } from "react";
import { useGitHub } from "@ui/services/GitHubProvider";
import { PLUGIN } from "@common/networkSides";
import { UI_CHANNEL } from "@ui/app.network";
import { computeDiff, DiffItem } from "@ui/utils/diff";

export function useUpdates() {
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

  return {
    config,
    service,
    loading,
    diffItems,
    statusMsg,
    fetchAndDiff,
    handleAcceptUpdates,
  };
}
