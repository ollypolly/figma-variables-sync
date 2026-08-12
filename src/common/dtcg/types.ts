/**
 * Parsed flat representation of a W3C DTCG Token
 */
export interface ParsedToken {
  path: string[]; // e.g. ["brand", "color", "primary"]
  type: string;   // e.g. "color"
  value: any;     // raw default value or alias reference
  modes?: Record<string, any>; // sanitized mode override values
  description?: string;
  figmaScopes?: string[];
  figmaCodeSyntax?: Record<string, string>;
  figmaHiddenFromPublishing?: boolean;
}

// Shared shape for parsing results that quarantine invalid subtrees (see findTokens.ts) instead of dropping them.
export interface TokenParseResult {
  tokens: ParsedToken[];
  quarantined: string[];
}

// Figma's own default for a freshly-created variable — distinct from an explicit empty array,
// which means "hidden from every picker," a real state a token can deliberately be set to.
export const DEFAULT_VARIABLE_SCOPES: string[] = ["ALL_SCOPES"];
