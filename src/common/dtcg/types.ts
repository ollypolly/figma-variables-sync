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
