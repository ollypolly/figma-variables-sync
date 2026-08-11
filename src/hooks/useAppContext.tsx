import { createContext, h } from "preact";
import { useCallback, useContext, useRef, useState } from "preact/hooks";
import type { ComponentChildren } from "preact";

import { usePluginSettings } from "./usePluginSettings";
import type { PluginSettings } from "../types";

export interface Notice {
  id: number;
  message: string;
}

interface AppContextValue {
  settings: PluginSettings;
  setSettings: ReturnType<typeof usePluginSettings>["setSettings"];
  settingsLoading: boolean;
  isConfigured: boolean;
  notices: Notice[];
  addNotice: (message: string) => void;
  dismissNotice: (id: number) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

// Loads plugin settings once at the app root (instead of once per tab) and
// holds cross-tab notices, so both survive a tab switch — Tabs unmounts
// whichever tab isn't active, which would otherwise reset per-tab hook state.
export function AppProvider({ children }: { children: ComponentChildren }) {
  const { settings, setSettings, loading, isConfigured } = usePluginSettings();
  const [notices, setNotices] = useState<Notice[]>([]);
  const nextNoticeId = useRef(0);

  const addNotice = useCallback((message: string) => {
    const id = nextNoticeId.current++;
    setNotices((prev) => [...prev, { id, message }]);
  }, []);

  const dismissNotice = useCallback((id: number) => {
    setNotices((prev) => prev.filter((notice) => notice.id !== id));
  }, []);

  return (
    <AppContext.Provider
      value={{
        settings,
        setSettings,
        settingsLoading: loading,
        isConfigured,
        notices,
        addNotice,
        dismissNotice,
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
