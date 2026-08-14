import { TokenParseResult } from "../types";
import { findTokens } from "./findTokens";

export interface CollectionMetadata {
  hiddenFromPublishing?: boolean;
}

// Parse DTCG JSON into root-level modes, flat tokens, any quarantined paths,
// and per-collection metadata (read from each collection's own root node, e.g. Tokens.$extensions).
export function parseDtcg(
  jsonStr: string
): TokenParseResult & {
  modes: Record<string, any>;
  collectionMetadata: Record<string, CollectionMetadata>;
  unresolvedAliases: string[];
} {
  try {
    const data = JSON.parse(jsonStr);
    const rootModes = data.$modes || {};
    const { tokens, quarantined } = findTokens(data);

    // Not quarantined — these tokens still import/diff normally (falling back to a default
    // value for the unresolvable reference), just flagged so a designer/engineer can see which
    // ones got that treatment instead of silently discovering it later.
    const knownPaths = new Set(tokens.map((t) => t.path.join(".")));
    const isDanglingAlias = (val: unknown): boolean =>
      typeof val === "string" && val.startsWith("{") && val.endsWith("}") && !knownPaths.has(val.slice(1, -1));
    const unresolvedAliases = tokens
      .filter((t) => isDanglingAlias(t.value) || (t.modes && Object.values(t.modes).some(isDanglingAlias)))
      .map((t) => t.path.join("."));

    const collectionMetadata: Record<string, CollectionMetadata> = {};
    for (const key of Object.keys(data)) {
      if (key.startsWith("$")) continue;
      const hidden = data[key]?.$extensions?.figma?.hiddenFromPublishing;
      if (hidden) collectionMetadata[key] = { hiddenFromPublishing: true };
    }

    return { modes: rootModes, tokens, quarantined, collectionMetadata, unresolvedAliases };
  } catch (e) {
    console.error("Failed to parse DTCG JSON:", e);
    return { modes: {}, tokens: [], quarantined: [], collectionMetadata: {}, unresolvedAliases: [] };
  }
}
