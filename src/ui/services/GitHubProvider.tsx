import React, { createContext, useContext, useState, useEffect } from "react";
import { GitHubConfig, GitHubService } from "./github";
import { PLUGIN } from "@common/networkSides";
import { UI_CHANNEL } from "@ui/app.network";

interface GitHubContextType {
  config: GitHubConfig | null;
  saveConfig: (newConfig: GitHubConfig) => void;
  service: GitHubService | null;
  loading: boolean;
}

const GitHubContext = createContext<GitHubContextType>({
  config: null,
  saveConfig: () => {},
  service: null,
  loading: true,
});

export const GitHubProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [config, setConfig] = useState<GitHubConfig | null>(null);
  const [service, setService] = useState<GitHubService | null>(null);
  const [loading, setLoading] = useState(true);

  // Load configuration from Figma clientStorage via our main thread bridge
  useEffect(() => {
    async function load() {
      try {
        const saved = await UI_CHANNEL.request(PLUGIN, "loadSettings", []);
        if (saved) {
          setConfig(saved);
          if (saved.pat) {
            setService(new GitHubService(saved.pat));
          }
        }
      } catch (e) {
        console.error("Failed to load settings from Figma:", e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const saveConfig = async (newConfig: GitHubConfig) => {
    setConfig(newConfig);
    if (newConfig.pat) {
      setService(new GitHubService(newConfig.pat));
    } else {
      setService(null);
    }
    try {
      await UI_CHANNEL.request(PLUGIN, "saveSettings", [newConfig]);
    } catch (e) {
      console.error("Failed to save settings to Figma:", e);
    }
  };

  return (
    <GitHubContext.Provider value={{ config, saveConfig, service, loading }}>
      {children}
    </GitHubContext.Provider>
  );
};

export const useGitHub = () => useContext(GitHubContext);
