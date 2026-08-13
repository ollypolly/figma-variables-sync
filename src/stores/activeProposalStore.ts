import { computed } from "nanostores";

import type {
  ActiveProposal,
  ActiveProposalLoadedHandler,
  LoadActiveProposalHandler,
  SaveActiveProposalHandler,
} from "../types";
import { figmaPersistedAtom } from "./figmaPersistedAtom";

const { store: $activeProposal, loaded: $activeProposalLoaded } = figmaPersistedAtom<
  ActiveProposal | null,
  LoadActiveProposalHandler,
  ActiveProposalLoadedHandler,
  SaveActiveProposalHandler
>(null, "LOAD_ACTIVE_PROPOSAL", "ACTIVE_PROPOSAL_LOADED", "SAVE_ACTIVE_PROPOSAL");

export { $activeProposal };

export const $activeProposalLoading = computed($activeProposalLoaded, (loaded) => !loaded);
