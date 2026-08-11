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

// Loaded once at the app root — Tabs unmounts inactive tabs, so per-tab loading reloaded on every switch.
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
