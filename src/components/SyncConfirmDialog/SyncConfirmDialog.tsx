import { Button, Modal, Text } from "@create-figma-plugin/ui";
import { h } from "preact";

import type { DiffItem } from "@common/diff";
import { DiffList } from "@components/DiffList";

interface SyncConfirmDialogProps {
  open: boolean;
  targetLabel: string;
  items: DiffItem[];
  primaryModeName: string;
  loading: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function SyncConfirmDialog({
  open,
  targetLabel,
  items,
  primaryModeName,
  loading,
  onConfirm,
  onCancel,
}: SyncConfirmDialogProps) {
  const count = items.length;
  return (
    <Modal open={open} title="Pull in changes?" onCloseButtonClick={onCancel} onOverlayClick={onCancel} position="center">
      <div style={{ width: "360px", padding: "16px", display: "flex", flexDirection: "column", gap: "12px" }}>
        <Text>
          {targetLabel} has {count} change{count === 1 ? "" : "s"} you don't have in Figma yet. Would you like to
          pull {count === 1 ? "it" : "them"} into Figma? Anything you haven't proposed yet stays untouched either way.
        </Text>
        <div style={{ maxHeight: "240px", overflowY: "auto", border: "1px solid var(--figma-color-border)", borderRadius: "2px" }}>
          <DiffList
            items={items}
            mode="updates"
            primaryModeName={primaryModeName}
            checking={false}
            emptyMessage="Nothing to pull in."
            countLabel={(n) => `${n} variable${n === 1 ? "" : "s"}`}
          />
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <Button onClick={onConfirm} loading={loading}>
            Pull into Figma
          </Button>
          <Button onClick={onCancel} secondary disabled={loading}>
            Not now
          </Button>
        </div>
      </div>
    </Modal>
  );
}
