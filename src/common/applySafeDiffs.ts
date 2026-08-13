import { getPath, setPath } from "./dtcg";

export function applySafeDiffsToFigmaJson(figmaJson: string, gitJson: string, safeDotPaths: Set<string>): string {
  const merged = JSON.parse(figmaJson || "{}");
  const gitTree = JSON.parse(gitJson || "{}");

  for (const dotPath of safeDotPaths) {
    const path = dotPath.split(".");
    const gitNode = getPath(gitTree, path);
    if (gitNode === undefined) continue;
    setPath(merged, path, gitNode);
  }

  return JSON.stringify(merged, null, 2);
}
