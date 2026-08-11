import { createContext, h } from "preact";
import { useContext } from "preact/hooks";
import type { ComponentChildren } from "preact";

import { usePluginSettings } from "./usePluginSettings";
import type { PluginSettings } from "../types";

interface AppContextValue {
  settings: PluginSettings;
  setSettings: ReturnType<typeof usePluginSettings>["setSettings"];
  settingsLoading: boolean;
  isConfigured: boolean;
}

const AppContext = createContext<AppContextValue | null>(null);

// Loads plugin settings once at the app root instead of once per tab — Tabs
// unmounts whichever tab isn't active, so each tab independently calling
// usePluginSettings() meant a full reload from clientStorage on every switch.
export function AppProvider({ children }: { children: ComponentChildren }) {
  const { settings, setSettings, loading, isConfigured } = usePluginSettings();

  return (
    <AppContext.Provider
      value={{
        settings,
        setSettings,
        settingsLoading: loading,
        isConfigured,
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
