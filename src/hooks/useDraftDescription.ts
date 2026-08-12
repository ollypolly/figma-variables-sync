import { emit, on } from "@create-figma-plugin/utilities";
import { useCallback, useEffect, useState } from "preact/hooks";

import type {
  DraftDescriptionLoadedHandler,
  LoadDraftDescriptionHandler,
  SaveDraftDescriptionHandler,
} from "../types";

export function useDraftDescription() {
  const [description, setDescriptionState] = useState("");

  useEffect(() => {
    const cleanup = on<DraftDescriptionLoadedHandler>("DRAFT_DESCRIPTION_LOADED", (loaded) => {
      setDescriptionState(loaded);
    });
    emit<LoadDraftDescriptionHandler>("LOAD_DRAFT_DESCRIPTION");
    return cleanup;
  }, []);

  const setDescription = useCallback((next: string) => {
    setDescriptionState(next);
    emit<SaveDraftDescriptionHandler>("SAVE_DRAFT_DESCRIPTION", next);
  }, []);

  return { description, setDescription };
}
