import { ParsedToken } from "../types";
import { findTokens } from "./findTokens";

// Parse DTCG JSON into root-level modes and flat tokens.
export function parseDtcg(jsonStr: string): { modes: Record<string, any>; tokens: ParsedToken[] } {
  try {
    const data = JSON.parse(jsonStr);
    const rootModes = data.$modes || {};
    const tokens = findTokens(data);
    return { modes: rootModes, tokens };
  } catch (e) {
    console.error("Failed to parse DTCG JSON:", e);
    return { modes: {}, tokens: [] };
  }
}
