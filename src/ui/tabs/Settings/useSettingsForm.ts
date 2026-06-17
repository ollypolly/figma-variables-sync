import { useState, useEffect } from "react";
import { useGitHub } from "@ui/services/GitHubProvider";

export function useSettingsForm() {
  const { config, saveConfig, service } = useGitHub();
  const [pat, setPat] = useState("");
  const [owner, setOwner] = useState("");
  const [repo, setRepo] = useState("");
  const [filePath, setFilePath] = useState("tokens/design-tokens.json");
  const [branch, setBranch] = useState("main");

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // Sync state when config loads from Figma storage
  useEffect(() => {
    if (config) {
      setPat(config.pat || "");
      setOwner(config.owner || "");
      setRepo(config.repo || "");
      setFilePath(config.filePath || "tokens/design-tokens.json");
      setBranch(config.branch || "main");
    }
  }, [config]);

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

  return {
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
  };
}
