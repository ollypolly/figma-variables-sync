import {
  IconChevronDown16,
  IconChevronRight16,
  Text,
  VerticalSpace,
} from "@create-figma-plugin/ui";
import { Fragment, h } from "preact";
import { useState } from "preact/hooks";

import type { DiffItem } from "@common/diff";
import { buildDiffTree, type DiffTreeNode } from "@common/diffTree";

interface DiffListProps {
  items: DiffItem[];
  mode: "updates" | "proposals";
}

const TYPE_COLOR: Record<DiffItem["type"], string> = {
  added: "var(--figma-color-text-success)",
  modified: "var(--figma-color-text-warning)",
  deleted: "var(--figma-color-text-danger)",
};

export function DiffList({ items, mode }: DiffListProps) {
  const tree = buildDiffTree(items);
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

  return (
    <div>
      {tree.map((node) => (
        <DiffTreeRow
          key={node.dotPath}
          node={node}
          mode={mode}
          depth={0}
          openGroups={openGroups}
          onToggleGroup={toggleGroup}
        />
      ))}
    </div>
  );
}

function DiffTreeRow({
  node,
  mode,
  depth,
  openGroups,
  onToggleGroup,
}: {
  node: DiffTreeNode;
  mode: "updates" | "proposals";
  depth: number;
  openGroups: Set<string>;
  onToggleGroup: (dotPath: string) => void;
}) {
  const indent = 8 + depth * 16;

  if (node.type === "group") {
    const open = openGroups.has(node.dotPath);
    return (
      <Fragment>
        <div
          onClick={() => onToggleGroup(node.dotPath)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "4px",
            padding: `6px ${8}px 6px ${indent}px`,
            cursor: "pointer",
            borderRadius: "4px",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLDivElement).style.backgroundColor =
              "var(--figma-color-bg-hover)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLDivElement).style.backgroundColor = "transparent";
          }}
        >
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
    <div style={{ padding: `6px 8px 6px ${indent}px` }}>
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
