import { Button, LoadingIndicator, Muted, Text } from "@create-figma-plugin/ui";
import { h } from "preact";
import type { ComponentChildren } from "preact";

import type { DiffItem } from "@common/diff";
import { buildDiffTree } from "@common/diffTree";

import { DiffTreeRow } from "./DiffTreeRow";
import { useOpenGroups } from "./useOpenGroups";

interface DiffListProps {
  items: DiffItem[];
  mode: "updates" | "proposals";
  primaryModeName: string;
  checking: boolean;
  onRefresh: () => void;
  refreshDisabled?: boolean;
  emptyMessage: string;
  countLabel: (count: number) => ComponentChildren;
  headerAction?: ComponentChildren;
}

export function DiffList({
  items,
  mode,
  primaryModeName,
  checking,
  onRefresh,
  refreshDisabled,
  emptyMessage,
  countLabel,
  headerAction,
}: DiffListProps) {
  const tree = buildDiffTree(items);
  const { allGroupDotPaths, openGroups, toggleGroup, allExpanded, toggleAll } = useOpenGroups(
    items,
    tree,
    checking
  );

  return (
    <div style={{ padding: "8px 0" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 8px 6px" }}>
        <Text>
          <Muted>
            {checking
              ? "Refreshing…"
              : items.length === 0
                ? emptyMessage
                : countLabel(items.length)}
          </Muted>
        </Text>
        <div style={{ display: "flex", gap: "8px" }}>
          {headerAction}
          {allGroupDotPaths.length > 0 && (
            <Button onClick={toggleAll} secondary>
              {allExpanded ? "Collapse all" : "Expand all"}
            </Button>
          )}
          <Button onClick={onRefresh} disabled={checking || refreshDisabled} secondary>
            Refresh
          </Button>
        </div>
      </div>

      {checking ? (
        <LoadingIndicator />
      ) : items.length === 0 ? null : (
        tree.map((node) => (
          <DiffTreeRow
            key={node.dotPath}
            node={node}
            mode={mode}
            primaryModeName={primaryModeName}
            depth={0}
            guideDepths={[]}
            openGroups={openGroups}
            onToggleGroup={toggleGroup}
          />
        ))
      )}
    </div>
  );
}
