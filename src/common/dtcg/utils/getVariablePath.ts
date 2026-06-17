import { sanitizeName } from "./sanitizeName";

/**
 * Builds the standard DTCG dot-notation path from collection name and variable name.
 */
export function getVariablePath(collectionName: string | undefined, variableName: string): string {
  const colName = collectionName ? sanitizeName(collectionName) : "library";
  const varName = variableName.split("/").map(sanitizeName).join(".");
  return `${colName}.${varName}`;
}
