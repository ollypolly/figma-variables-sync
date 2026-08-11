import { ParsedToken, TokenParseResult } from "../types";

function hasChildTokenKeys(obj: any): boolean {
  return Object.keys(obj).some((key) => !key.startsWith("$"));
}

// Recursively traverse a W3C DTCG JSON object to extract flat list of tokens.
export function findTokens(obj: any, path: string[] = []): TokenParseResult {
  if (!obj || typeof obj !== "object") return { tokens: [], quarantined: [] };

  if ("$value" in obj) {
    if (hasChildTokenKeys(obj)) {
      return { tokens: [], quarantined: [path.join(".")] };
    }
    return {
      tokens: [
        {
          path,
          type: obj.$type || "string",
          value: obj.$value,
          modes: obj.$modes,
          description: obj.$description,
          figmaScopes: obj.$extensions?.figma?.scopes,
          figmaCodeSyntax: obj.$extensions?.figma?.codeSyntax,
          figmaHiddenFromPublishing: obj.$extensions?.figma?.hiddenFromPublishing,
        },
      ],
      quarantined: [],
    };
  }

  const tokens: ParsedToken[] = [];
  const quarantined: string[] = [];
  for (const key of Object.keys(obj)) {
    if (key.startsWith("$")) continue; // Skip metadata keys like $modes, $type
    const result = findTokens(obj[key], [...path, key]);
    tokens.push(...result.tokens);
    quarantined.push(...result.quarantined);
  }
  return { tokens, quarantined };
}
