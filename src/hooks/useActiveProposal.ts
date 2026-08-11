import { emit, on } from "@create-figma-plugin/utilities";
import { useCallback, useEffect, useState } from "preact/hooks";

import type {
  ActiveProposal,
  ActiveProposalLoadedHandler,
  LoadActiveProposalHandler,
  SaveActiveProposalHandler,
} from "../types";

export function useActiveProposal() {
  const [activeProposal, setActiveProposalState] = useState<ActiveProposal | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const cleanup = on<ActiveProposalLoadedHandler>("ACTIVE_PROPOSAL_LOADED", (loaded) => {
      setActiveProposalState(loaded);
      setLoading(false);
    });
    emit<LoadActiveProposalHandler>("LOAD_ACTIVE_PROPOSAL");
    return cleanup;
  }, []);

  const setActiveProposal = useCallback((proposal: ActiveProposal | null) => {
    setActiveProposalState(proposal);
    emit<SaveActiveProposalHandler>("SAVE_ACTIVE_PROPOSAL", proposal);
  }, []);

  return { activeProposal, activeProposalLoading: loading, setActiveProposal };
}
