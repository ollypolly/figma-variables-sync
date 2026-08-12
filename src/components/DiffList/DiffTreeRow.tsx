import { IconChevronDown16, IconChevronRight16, Text, VerticalSpace } from "@create-figma-plugin/ui";
import { Fragment, h } from "preact";

import type { DiffTreeNode } from "@common/diffTree";

import { TYPE_COLOR, buildSingleValueLines, renderLines, renderModifiedDetailLines } from "./diffValueFormatting";

const GROUP_ROW_HEIGHT = 28;
// Shallower (ancestor) sticky headers must stay in front of deeper ones as they
// scroll underneath — descending z-index by depth, with enough headroom that no
// realistic nesting depth reaches 0.
const STICKY_Z_INDEX_BASE = 100;
const INDENT_STEP = 16;
const BASE_INDENT = 8;
const ROW_GAP = 2;

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

export function DiffTreeRow({
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
