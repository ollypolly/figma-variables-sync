import type { DiffItem } from "./diff";

export interface DiffTreeGroup {
  type: "group";
  name: string;
  dotPath: string;
  children: DiffTreeNode[];
}

export interface DiffTreeLeaf {
  type: "leaf";
  name: string;
  dotPath: string;
  item: DiffItem;
}

export type DiffTreeNode = DiffTreeGroup | DiffTreeLeaf;

/**
 * Groups flat diff items into a tree by path segment, mirroring Figma's
 * Variables panel (collection > group > ... > variable) instead of a flat list.
 */
export function buildDiffTree(items: DiffItem[]): DiffTreeNode[] {
  const root: DiffTreeNode[] = [];
  // dotPath is unique per group regardless of depth, so one Map covers the whole
  // tree — avoids re-scanning a depth level's sibling array for every item.
  const groupsByDotPath = new Map<string, DiffTreeGroup>();

  for (const item of items) {
    let siblings = root;

    for (let depth = 0; depth < item.path.length - 1; depth++) {
      const segment = item.path[depth];
      const dotPath = item.path.slice(0, depth + 1).join(".");
      let group = groupsByDotPath.get(dotPath);
      if (!group) {
        group = { type: "group", name: segment, dotPath, children: [] };
        groupsByDotPath.set(dotPath, group);
        siblings.push(group);
      }
      siblings = group.children;
    }

    const name = item.path[item.path.length - 1];
    siblings.push({ type: "leaf", name, dotPath: item.dotPath, item });
  }

  return root;
}
