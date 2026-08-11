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
import { useEffect, useRef, useState } from "preact/hooks";

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
  headerAction?: ComponentChildren;
}

const TYPE_COLOR: Record<DiffItem["type"], string> = {
  added: "var(--figma-color-text-success)",
  modified: "var(--figma-color-text-warning)",
  deleted: "var(--figma-color-text-danger)",
};

const FIELD_LABEL: Record<NonNullable<DiffItem["changedFields"]>[number]["field"], string> = {
  type: "Type",
  description: "Description",
  scopes: "Scopes",
  codeSyntax: "Code syntax",
  hiddenFromPublishing: "Hidden from publishing",
};

const GROUP_ROW_HEIGHT = 28;
// Shallower (ancestor) sticky headers must stay in front of deeper ones as they
// scroll underneath — descending z-index by depth, with enough headroom that no
// realistic nesting depth reaches 0.
const STICKY_Z_INDEX_BASE = 100;
const INDENT_STEP = 16;
const BASE_INDENT = 8;
const ROW_GAP = 2;
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

export function DiffList({
  items,
  mode,
  checking,
  onRefresh,
  refreshDisabled,
  emptyMessage,
  countLabel,
  headerAction,
}: DiffListProps) {
  const tree = buildDiffTree(items);
  const allGroupDotPaths = collectGroupDotPaths(tree);
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());

  // `items` is still [] on this component's very first render (checking hasn't resolved yet on
  // tab mount), so the auto-expand-by-count decision can't be made from useState's one-shot
  // initializer — it would always see an empty list. Apply it once real data lands instead, and
  // only once per mount, so it doesn't fight a designer's own manual expand/collapse afterward.
  //
  // `checking` is actually still `false` on this very first render too — a child's effects run
  // before its parent's, so this fires before useProposals's mount effect has even called
  // check.execute() yet. Guarding on "not checking" alone would fire immediately with the still-
  // empty items and never get a second chance — has to watch for a true→false transition instead,
  // to tell "hasn't started checking" apart from "finished checking".
  const hasSeenChecking = useRef(false);
  const appliedInitialDefault = useRef(false);
  useEffect(() => {
    if (checking) {
      hasSeenChecking.current = true;
      return;
    }
    if (!hasSeenChecking.current || appliedInitialDefault.current) return;
    appliedInitialDefault.current = true;
    // A small diff is quick to scan fully expanded — nothing to choose between. Once it's large
    // enough that expanding everything would just be a wall of rows, default to collapsed (or,
    // if there's a single top-level group, open just that one — nothing to choose between there
    // either).
    const defaultOpen =
      items.length > 0 && items.length <= AUTO_EXPAND_THRESHOLD
        ? allGroupDotPaths
        : tree.length === 1 && tree[0].type === "group"
          ? [tree[0].dotPath]
          : [];
    setOpenGroups(new Set(defaultOpen));
  }, [checking, items]);

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
          {headerAction}
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

// create-figma-plugin/ui's Text applies a negative top margin tuned to sit right
// after a VerticalSpace — stacking Texts directly against each other overlaps them,
// so every line after the first needs its own VerticalSpace separator.
function renderModifiedDetailLines(
  item: DiffItem,
  oldVal: string,
  newVal: string,
  mode: "updates" | "proposals"
) {
  const lines: { key: string; color: string; content: ComponentChildren }[] = [];

  if (oldVal !== newVal) {
    lines.push({ key: "value", color: TYPE_COLOR.modified, content: `${oldVal} → ${newVal}` });
  }

  for (const cf of item.changedFields ?? []) {
    const newFieldVal = mode === "proposals" ? cf.figmaVal : cf.gitVal;
    const oldFieldVal = mode === "proposals" ? cf.gitVal : cf.figmaVal;
    const isTypeChange = cf.field === "type";
    lines.push({
      key: cf.field,
      color: isTypeChange ? "var(--figma-color-text-danger)" : TYPE_COLOR.modified,
      content: (
        <Fragment>
          {FIELD_LABEL[cf.field]}: {oldFieldVal || "—"} → {newFieldVal || "—"}
          {isTypeChange && " — will delete and recreate this variable in Figma"}
        </Fragment>
      ),
    });
  }

  return lines.map((line, i) => (
    <Fragment key={line.key}>
      {i > 0 && <VerticalSpace space="extraSmall" />}
      <Text>
        <span style={{ color: line.color }}>{line.content}</span>
      </Text>
    </Fragment>
  ));
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
      // A real element (not a Fragment) so the sticky header's containing block is
      // scoped to this group's own subtree — otherwise it never releases on scroll,
      // since sticky un-sticks relative to its parent's bounds, and a Fragment has none.
      <div>
        <div
          onClick={() => onToggleGroup(node.dotPath)}
          style={{
            position: "sticky",
            top: `${depth * GROUP_ROW_HEIGHT}px`,
            zIndex: STICKY_Z_INDEX_BASE - depth,
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
      </div>
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
      {item.type === "modified" &&
        renderModifiedDetailLines(item, oldVal, newVal, mode)}
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
