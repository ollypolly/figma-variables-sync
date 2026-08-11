import { deletePath, getPath, setPath } from "./dtcg";

export function applyStagedDiffs(baseJson: string, figmaJson: string, stagedDotPaths: Set<string>): string {
  const merged = JSON.parse(baseJson || "{}");
  const figmaTree = JSON.parse(figmaJson || "{}");

  for (const dotPath of stagedDotPaths) {
    const path = dotPath.split(".");
    const figmaNode = getPath(figmaTree, path);
    if (figmaNode === undefined) {
      deletePath(merged, path);
    } else {
      setPath(merged, path, figmaNode);
    }
  }

  // Root-level facts Figma is unconditionally authoritative for — not scoped to any single
  // token's path, so no diffed dot-path could ever represent them.
  if (figmaTree.$modes) {
    merged.$modes = figmaTree.$modes;
  } else {
    delete merged.$modes;
  }

  const collectionNames = new Set([...Object.keys(merged), ...Object.keys(figmaTree)]);
  for (const colName of collectionNames) {
    if (colName.startsWith("$") || merged[colName] === undefined) continue;
    const figmaExtensions = figmaTree[colName]?.$extensions;
    if (figmaExtensions) {
      merged[colName].$extensions = figmaExtensions;
    } else {
      delete merged[colName].$extensions;
    }
  }

  return JSON.stringify(merged, null, 2);
}
