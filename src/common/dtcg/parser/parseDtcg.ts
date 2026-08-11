import { TokenParseResult } from "../types";
import { findTokens } from "./findTokens";

export interface CollectionMetadata {
  hiddenFromPublishing?: boolean;
}

// Parse DTCG JSON into root-level modes, flat tokens, any quarantined paths,
// and per-collection metadata (read from each collection's own root node, e.g. Tokens.$extensions).
export function parseDtcg(
  jsonStr: string
): TokenParseResult & { modes: Record<string, any>; collectionMetadata: Record<string, CollectionMetadata> } {
  try {
    const data = JSON.parse(jsonStr);
    const rootModes = data.$modes || {};
    const { tokens, quarantined } = findTokens(data);

    const collectionMetadata: Record<string, CollectionMetadata> = {};
    for (const key of Object.keys(data)) {
      if (key.startsWith("$")) continue;
      const hidden = data[key]?.$extensions?.figma?.hiddenFromPublishing;
      if (hidden) collectionMetadata[key] = { hiddenFromPublishing: true };
    }

    return { modes: rootModes, tokens, quarantined, collectionMetadata };
  } catch (e) {
    console.error("Failed to parse DTCG JSON:", e);
    return { modes: {}, tokens: [], quarantined: [], collectionMetadata: {} };
  }
}
