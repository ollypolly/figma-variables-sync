import { ParsedToken } from "../types";

// Recursively traverse a W3C DTCG JSON object to extract flat list of tokens.
export function findTokens(obj: any, path: string[] = []): ParsedToken[] {
  if (!obj || typeof obj !== "object") return [];

  if ("$value" in obj) {
    return [
      {
        path,
        type: obj.$type || "string",
        value: obj.$value,
        modes: obj.$modes,
      },
    ];
  }

  const tokens: ParsedToken[] = [];
  for (const key of Object.keys(obj)) {
    if (key.startsWith("$")) continue; // Skip metadata keys like $modes, $type
    tokens.push(...findTokens(obj[key], [...path, key]));
  }
  return tokens;
}
