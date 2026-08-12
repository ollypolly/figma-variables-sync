import { createContext, h } from "preact";
import { useContext } from "preact/hooks";
import type { ComponentChildren } from "preact";

import { useActiveProposal } from "./useActiveProposal";
import { usePluginSettings } from "./usePluginSettings";
import type { ActiveProposal, PluginSettings } from "../types";

interface AppContextValue {
  settings: PluginSettings;
  setSettings: ReturnType<typeof usePluginSettings>["setSettings"];
  settingsLoading: boolean;
  isConfigured: boolean;
  activeProposal: ActiveProposal | null;
  activeProposalLoading: boolean;
  setActiveProposal: (proposal: ActiveProposal | null) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

// Loaded once at the app root — Tabs unmounts inactive tabs, so per-tab loading reloaded on every switch.
export function AppProvider({ children }: { children: ComponentChildren }) {
  const { settings, setSettings, loading, isConfigured } = usePluginSettings();
  const { activeProposal, activeProposalLoading, setActiveProposal } = useActiveProposal();

  return (
    <AppContext.Provider
      value={{
        settings,
        setSettings,
        settingsLoading: loading,
        isConfigured,
        activeProposal,
        activeProposalLoading,
        setActiveProposal,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useAppContext must be used within an AppProvider");
  return ctx;
}
