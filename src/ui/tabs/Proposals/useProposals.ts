import { useEffect, useState } from "react";
import { useGitHub } from "@ui/services/GitHubProvider";
import { PLUGIN } from "@common/networkSides";
import { UI_CHANNEL } from "@ui/app.network";
import { computeDiff, DiffItem } from "@ui/utils/diff";
import { Proposal } from "@ui/components/business/ProposalList";

export function useProposals() {
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

  return {
    config,
    service,
    loading,
    diffItems,
    proposals,
    prDescription,
    setPrDescription,
    submitting,
    statusMsg,
    fetchAndDiff,
    handleSubmitProposal,
  };
}
