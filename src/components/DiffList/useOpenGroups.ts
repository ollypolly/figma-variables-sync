import { useEffect, useRef, useState } from "preact/hooks";

import type { DiffItem } from "@common/diff";
import type { DiffTreeNode } from "@common/diffTree";

const AUTO_EXPAND_THRESHOLD = 10;

function collectGroupDotPaths(nodes: DiffTreeNode[]): string[] {
  const dotPaths: string[] = [];
  for (const node of nodes) {
    if (node.type === "group") {
      dotPaths.push(node.dotPath, ...collectGroupDotPaths(node.children));
    }
  }
  return dotPaths;
}

function computeInitialOpenGroups(
  items: DiffItem[],
  tree: DiffTreeNode[],
  allGroupDotPaths: string[]
): string[] {
  if (items.length > 0 && items.length <= AUTO_EXPAND_THRESHOLD) return allGroupDotPaths;
  if (tree.length === 1 && tree[0].type === "group") return [tree[0].dotPath];
  return [];
}

function useHasFinishedFirstLoad(loading: boolean): boolean {
  const [hasFinished, setHasFinished] = useState(false);
  const wasLoading = useRef(false);
  useEffect(() => {
    if (loading) {
      wasLoading.current = true;
    } else if (wasLoading.current) {
      setHasFinished(true);
    }
  }, [loading]);
  return hasFinished;
}

export function useOpenGroups(items: DiffItem[], tree: DiffTreeNode[], checking: boolean) {
  const allGroupDotPaths = collectGroupDotPaths(tree);
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());

  const hasFinishedFirstLoad = useHasFinishedFirstLoad(checking);
  const appliedInitialOpenGroups = useRef(false);
  useEffect(() => {
    if (!hasFinishedFirstLoad || appliedInitialOpenGroups.current) return;
    appliedInitialOpenGroups.current = true;
    setOpenGroups(new Set(computeInitialOpenGroups(items, tree, allGroupDotPaths)));
  }, [hasFinishedFirstLoad, items]);

  function toggleGroup(dotPath: string) {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(dotPath)) {
        next.delete(dotPath);
      } else {
        next.add(dotPath);
      }
      return next;
    });
  }

  const allExpanded = allGroupDotPaths.every((dotPath) => openGroups.has(dotPath));

  function toggleAll() {
    setOpenGroups(allExpanded ? new Set() : new Set(allGroupDotPaths));
  }

  return { allGroupDotPaths, openGroups, toggleGroup, allExpanded, toggleAll };
}
