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
  primaryModeName: string;
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

// Color alone isn't a WCAG 1.4.1-compliant signal for added/modified/deleted — pairing it with a
// distinct glyph keeps the distinction legible without relying on color perception.
const TYPE_GLYPH: Record<DiffItem["type"], string> = {
  added: "+",
  modified: "~",
  deleted: "−",
};

const HEX_COLOR_PATTERN = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

function ColorSwatch({ value }: { value: string }) {
  return (
    <div
      style={{
        display: "inline-block",
        width: "12px",
        height: "12px",
        borderRadius: "2px",
        border: "1px solid var(--figma-color-border)",
        backgroundColor: value,
        verticalAlign: "text-bottom",
      }}
    />
  );
}

function valueContent(value: string) {
  return (
    <Fragment>
      {HEX_COLOR_PATTERN.test(value) && <ColorSwatch value={value} />} {value}
    </Fragment>
  );
}

function ModePill({ name }: { name: string }) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "0 5px",
        marginRight: "4px",
        borderRadius: "8px",
        fontSize: "10px",
        lineHeight: "14px",
        verticalAlign: "middle",
        backgroundColor: "var(--figma-color-bg-secondary)",
        color: "var(--figma-color-text-secondary)",
      }}
    >
      {name}
    </span>
  );
}

// formatTokenVal renders a multi-mode token as "primary (Mode: value, Mode: value)" — split that
// back apart so each mode can get its own clearly-labeled line instead of one cramped string.
function splitModeValues(formatted: string): { primary: string; extraModes: [string, string][] } {
  const match = formatted.match(/^(.*?)(?:\s\((.+)\))?$/);
  const primary = match?.[1] ?? formatted;
  const modesStr = match?.[2];
  const extraModes: [string, string][] = [];
  if (modesStr) {
    for (const pair of modesStr.split(", ")) {
      const separatorIndex = pair.indexOf(": ");
      if (separatorIndex !== -1) {
        extraModes.push([pair.slice(0, separatorIndex), pair.slice(separatorIndex + 2)]);
      }
    }
  }
  return { primary, extraModes };
}

type Line = { key: string; color: string; content: ComponentChildren };

// create-figma-plugin/ui's Text applies a negative top margin tuned to sit right after a
// VerticalSpace — stacking Texts directly against each other overlaps them, so every line after
// the first needs its own VerticalSpace separator.
function renderLines(lines: Line[]) {
  return lines.map((line, i) => (
    <Fragment key={line.key}>
      {i > 0 && <VerticalSpace space="extraSmall" />}
      <Text>
        <span style={{ color: line.color }}>{line.content}</span>
      </Text>
    </Fragment>
  ));
}

function buildSingleValueLines(
  type: "added" | "deleted",
  formatted: string,
  primaryModeName: string
): Line[] {
  const { primary, extraModes } = splitModeValues(formatted);
  const rows = [
    { key: "primary", label: extraModes.length > 0 ? primaryModeName : null, value: primary },
    ...extraModes.map(([modeName, value]) => ({ key: `mode-${modeName}`, label: modeName, value })),
  ];
  return rows.map((row) => ({
    key: row.key,
    color: TYPE_COLOR[type],
    content: (
      <Fragment>
        {TYPE_GLYPH[type]} {row.label && <ModePill name={row.label} />}
        {valueContent(row.value)}
      </Fragment>
    ),
  }));
}

function buildModifiedValueLines(oldVal: string, newVal: string, primaryModeName: string): Line[] {
  if (oldVal === newVal) return [];
  const oldSplit = splitModeValues(oldVal);
  const newSplit = splitModeValues(newVal);
  const oldModeMap = new Map(oldSplit.extraModes);
  const newModeMap = new Map(newSplit.extraModes);
  const modeNames = [...new Set([...oldModeMap.keys(), ...newModeMap.keys()])];

  const rows: { key: string; label: string | null; oldValue: string; newValue: string }[] = [];
  if (oldSplit.primary !== newSplit.primary) {
    rows.push({
      key: "primary",
      label: modeNames.length > 0 ? primaryModeName : null,
      oldValue: oldSplit.primary,
      newValue: newSplit.primary,
    });
  }
  for (const modeName of modeNames) {
    const oldValue = oldModeMap.get(modeName) ?? oldSplit.primary;
    const newValue = newModeMap.get(modeName) ?? newSplit.primary;
    if (oldValue !== newValue) {
      rows.push({ key: `mode-${modeName}`, label: modeName, oldValue, newValue });
    }
  }

  return rows.map((row) => ({
    key: row.key,
    color: TYPE_COLOR.modified,
    content: (
      <Fragment>
        {TYPE_GLYPH.modified} {row.label && <ModePill name={row.label} />}
        {valueContent(row.oldValue)} → {valueContent(row.newValue)}
      </Fragment>
    ),
  }));
}

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

function renderModifiedDetailLines(
  item: DiffItem,
  oldVal: string,
  newVal: string,
  mode: "updates" | "proposals",
  primaryModeName: string
) {
  const lines: Line[] = [...buildModifiedValueLines(oldVal, newVal, primaryModeName)];

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

  return renderLines(lines);
}

function DiffTreeRow({
  node,
  mode,
  primaryModeName,
  depth,
  guideDepths,
  openGroups,
  onToggleGroup,
}: {
  node: DiffTreeNode;
  mode: "updates" | "proposals";
  primaryModeName: string;
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
              primaryModeName={primaryModeName}
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
      <Text>
        {item.type === "modified" ? (
          node.name
        ) : (
          <span style={{ color: TYPE_COLOR[item.type] }}>{node.name}</span>
        )}
      </Text>
      <VerticalSpace space="extraSmall" />
      {item.type === "modified" &&
        renderModifiedDetailLines(item, oldVal, newVal, mode, primaryModeName)}
      {item.type === "added" && renderLines(buildSingleValueLines("added", newVal, primaryModeName))}
      {item.type === "deleted" && renderLines(buildSingleValueLines("deleted", oldVal, primaryModeName))}
    </div>
  );
}
