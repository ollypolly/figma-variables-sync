import { useMemo } from "preact/hooks";

import { GitHubService } from "@services/github";
import type { PluginSettings } from "../types";

export function useGitHub(settings: PluginSettings) {
  return useMemo(() => {
    if (!settings.pat) return null;
    return new GitHubService(settings.pat);
  }, [settings.pat]);
}
