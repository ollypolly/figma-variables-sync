import {
  Button,
  IconChevronDown16,
  IconChevronRight16,
  LoadingIndicator,
  Muted,
  Text,
  VerticalSpace,
} from "@create-figma-plugin/ui";
import { Fragment, h } from "preact";
import type { ComponentChildren } from "preact";
import { useState } from "preact/hooks";

import type { DiffItem } from "@common/diff";
import { buildDiffTree, type DiffTreeNode } from "@common/diffTree";

interface DiffListProps {
  items: DiffItem[];
  mode: "updates" | "proposals";
  checking: boolean;
  onRefresh: () => void;
  refreshDisabled?: boolean;
  emptyMessage: string;
  countLabel: (count: number) => ComponentChildren;
}

const TYPE_COLOR: Record<DiffItem["type"], string> = {
  added: "var(--figma-color-text-success)",
  modified: "var(--figma-color-text-warning)",
  deleted: "var(--figma-color-text-danger)",
};

const GROUP_ROW_HEIGHT = 28;
const INDENT_STEP = 16;
const BASE_INDENT = 8;
const ROW_GAP = 2;

function collectGroupDotPaths(nodes: DiffTreeNode[]): string[] {
  const dotPaths: string[] = [];
  for (const node of nodes) {
    if (node.type === "group") {
      dotPaths.push(node.dotPath, ...collectGroupDotPaths(node.children));
    }
  }
  return dotPaths;
}

export function DiffList({
  items,
  mode,
  checking,
  onRefresh,
  refreshDisabled,
  emptyMessage,
  countLabel,
}: DiffListProps) {
  const tree = buildDiffTree(items);
  const allGroupDotPaths = collectGroupDotPaths(tree);
  // Auto-expand when there's a single top-level group — nothing to choose between yet.
  const defaultOpen = tree.length === 1 && tree[0].type === "group" ? tree[0].dotPath : null;
  const [openGroups, setOpenGroups] = useState<Set<string>>(
    new Set(defaultOpen ? [defaultOpen] : [])
  );

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
          {allGroupDotPaths.length > 0 && (
            <Button
              onClick={() =>
                setOpenGroups(allExpanded ? new Set() : new Set(allGroupDotPaths))
              }
              secondary
            >
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

function GuideLines({ guideDepths }: { guideDepths: number[] }) {
  return (
    <Fragment>
      {guideDepths.map((level) => (
        <div
          key={level}
          style={{
            position: "absolute",
            left: `${BASE_INDENT + level * INDENT_STEP + 8}px`,
            top: 0,
            bottom: 0,
            width: "1px",
            backgroundColor: "var(--figma-color-border)",
            pointerEvents: "none",
          }}
        />
      ))}
    </Fragment>
  );
}

function DiffTreeRow({
  node,
  mode,
  depth,
  guideDepths,
  openGroups,
  onToggleGroup,
}: {
  node: DiffTreeNode;
  mode: "updates" | "proposals";
  depth: number;
  guideDepths: number[];
  openGroups: Set<string>;
  onToggleGroup: (dotPath: string) => void;
}) {
  const indent = BASE_INDENT + depth * INDENT_STEP;

  if (node.type === "group") {
    const open = openGroups.has(node.dotPath);
    return (
      <Fragment>
        <div
          onClick={() => onToggleGroup(node.dotPath)}
          style={{
            position: "sticky",
            top: `${depth * GROUP_ROW_HEIGHT}px`,
            zIndex: 10,
            height: `${GROUP_ROW_HEIGHT}px`,
            marginBottom: `${ROW_GAP}px`,
            display: "flex",
            alignItems: "center",
            gap: "4px",
            padding: `0 8px 0 ${indent}px`,
            cursor: "pointer",
            borderRadius: "4px",
            backgroundColor: "var(--figma-color-bg)",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLDivElement).style.backgroundColor =
              "var(--figma-color-bg-hover)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLDivElement).style.backgroundColor =
              "var(--figma-color-bg)";
          }}
        >
          <GuideLines guideDepths={guideDepths} />
          {open ? <IconChevronDown16 /> : <IconChevronRight16 />}
          <Text>
            <strong>{node.name}</strong>
          </Text>
        </div>
        {open &&
          node.children.map((child) => (
            <DiffTreeRow
              key={child.dotPath}
              node={child}
              mode={mode}
              depth={depth + 1}
              guideDepths={[...guideDepths, depth]}
              openGroups={openGroups}
              onToggleGroup={onToggleGroup}
            />
          ))}
      </Fragment>
    );
  }

  const item = node.item;
  const newVal = mode === "proposals" ? item.figmaVal : item.gitVal;
  const oldVal = mode === "proposals" ? item.gitVal : item.figmaVal;

  return (
    <div
      style={{
        position: "relative",
        marginBottom: `${ROW_GAP}px`,
        padding: `6px 8px 6px ${indent}px`,
      }}
    >
      <GuideLines guideDepths={guideDepths} />
      <Text>{node.name}</Text>
      <VerticalSpace space="extraSmall" />
      {item.type === "modified" && (
        <Text>
          <span style={{ color: TYPE_COLOR[item.type] }}>
            {oldVal} → {newVal}
          </span>
        </Text>
      )}
      {item.type === "added" && (
        <Text>
          <span style={{ color: TYPE_COLOR[item.type] }}>{newVal}</span>
        </Text>
      )}
      {item.type === "deleted" && (
        <Text>
          <span style={{ color: TYPE_COLOR[item.type] }}>{oldVal}</span>
        </Text>
      )}
    </div>
  );
}
