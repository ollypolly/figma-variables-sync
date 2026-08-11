import { ParsedToken } from "../types";
import { findTokens } from "./findTokens";

// Parse DTCG JSON into root-level modes, flat tokens, and any quarantined paths.
export function parseDtcg(
  jsonStr: string
): { modes: Record<string, any>; tokens: ParsedToken[]; quarantined: string[] } {
  try {
    const data = JSON.parse(jsonStr);
    const rootModes = data.$modes || {};
    const { tokens, quarantined } = findTokens(data);
    return { modes: rootModes, tokens, quarantined };
  } catch (e) {
    console.error("Failed to parse DTCG JSON:", e);
    return { modes: {}, tokens: [], quarantined: [] };
  }
}
