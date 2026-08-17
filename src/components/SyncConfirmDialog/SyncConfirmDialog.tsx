import { Button, Modal, Text } from "@create-figma-plugin/ui";
import { h } from "preact";

interface SyncConfirmDialogProps {
  open: boolean;
  targetLabel: string;
  count: number;
  loading: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function SyncConfirmDialog({ open, targetLabel, count, loading, onConfirm, onCancel }: SyncConfirmDialogProps) {
  return (
    <Modal open={open} title="Sync variables" onCloseButtonClick={onCancel} onOverlayClick={onCancel} position="center">
      <div style={{ width: "320px", padding: "16px", display: "flex", flexDirection: "column", gap: "12px" }}>
        <Text>
          This will update or remove {count} variable{count === 1 ? "" : "s"} in Figma to match {targetLabel}. Any
          local changes you haven't proposed yet won't be touched.
        </Text>
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
