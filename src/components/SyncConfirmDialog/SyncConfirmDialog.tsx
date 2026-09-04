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
    <Modal open={open} title="Sync variables" onCloseButtonClick={onCancel} onOverlayClick={onCancel} position="center">
      <div style={{ width: "360px", padding: "16px", display: "flex", flexDirection: "column", gap: "12px" }}>
        <Text>
          This will update or remove {count} variable{count === 1 ? "" : "s"} in Figma to match {targetLabel}. Any
          local changes you haven't proposed yet won't be touched.
        </Text>
        <div style={{ maxHeight: "240px", overflowY: "auto", border: "1px solid var(--figma-color-border)", borderRadius: "2px" }}>
          <DiffList
            items={items}
            mode="updates"
            primaryModeName={primaryModeName}
            checking={false}
            emptyMessage="Nothing to sync."
            countLabel={(n) => `${n} variable${n === 1 ? "" : "s"}`}
          />
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <Button onClick={onConfirm} loading={loading}>
            Sync
          </Button>
          <Button onClick={onCancel} secondary disabled={loading}>
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
  );
}
