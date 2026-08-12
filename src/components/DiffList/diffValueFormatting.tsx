import { Text, VerticalSpace } from "@create-figma-plugin/ui";
import { Fragment, h } from "preact";
import type { ComponentChildren } from "preact";

import type { DiffItem } from "@common/diff";

export const TYPE_COLOR: Record<DiffItem["type"], string> = {
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
export function renderLines(lines: Line[]) {
  return lines.map((line, i) => (
    <Fragment key={line.key}>
      {i > 0 && <VerticalSpace space="extraSmall" />}
      <Text>
        <span style={{ color: line.color }}>{line.content}</span>
      </Text>
    </Fragment>
  ));
}

export function buildSingleValueLines(
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

export function renderModifiedDetailLines(
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
