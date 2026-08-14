import { Button, Modal, Muted, SegmentedControl, Text, TextboxMultiline } from "@create-figma-plugin/ui";
import { h } from "preact";

import { StatusBanner } from "@components/StatusBanner";
import type { FeedbackType } from "@services/feedback";

interface FeedbackModalProps {
  open: boolean;
  closeModal: () => void;
  type: FeedbackType;
  setType: (type: FeedbackType) => void;
  description: string;
  setDescription: (value: string) => void;
  submitting: boolean;
  canSubmit: boolean;
  submit: () => void;
  result: { success: boolean; text: string; link?: string } | null;
}

export function FeedbackModal({
  open,
  closeModal,
  type,
  setType,
  description,
  setDescription,
  submitting,
  canSubmit,
  submit,
  result,
}: FeedbackModalProps) {
  return (
    <Modal open={open} title="Send feedback" onCloseButtonClick={closeModal} onOverlayClick={closeModal} position="center">
      <div style={{ width: "320px", padding: "16px", display: "flex", flexDirection: "column", gap: "12px" }}>
        <SegmentedControl
          value={type}
          onValueChange={(value) => setType(value as FeedbackType)}
          options={[
            { value: "bug", children: "Bug" },
            { value: "feature", children: "Feature" },
          ]}
        />
        <TextboxMultiline
          value={description}
          onValueInput={setDescription}
          placeholder={
            type === "bug"
              ? "What went wrong? Steps to reproduce help."
              : "What would you like the plugin to do?"
          }
          rows={4}
        />
        {description.length > 0 && !result && (
          <Text>
            <Muted>You can dismiss this and come back — your draft is saved.</Muted>
          </Text>
        )}
        <StatusBanner status={result} />
        <Button onClick={submit} loading={submitting} disabled={!canSubmit} fullWidth>
          Send {type === "bug" ? "bug report" : "feature request"}
        </Button>
      </div>
    </Modal>
  );
}
