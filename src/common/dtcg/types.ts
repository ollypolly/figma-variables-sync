/**
 * Parsed flat representation of a W3C DTCG Token
 */
export interface ParsedToken {
  path: string[]; // e.g. ["brand", "color", "primary"]
  type: string;   // e.g. "color"
  value: any;     // raw default value or alias reference
  modes?: Record<string, any>; // sanitized mode override values
}
