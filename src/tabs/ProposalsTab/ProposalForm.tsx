import {
  Bold,
  Button,
  Muted,
  Text,
  TextboxMultiline,
  VerticalSpace,
} from "@create-figma-plugin/ui";
import { Fragment, h } from "preact";

import { DiffList } from "@components/DiffList";
import type { DiffItem } from "@common/diff";

interface ProposalFormProps {
  diffItems: DiffItem[];
  description: string;
  onDescriptionChange: (value: string) => void;
  onSubmit: () => void;
  submitting: boolean;
}

export function ProposalForm({
  diffItems,
  description,
  onDescriptionChange,
  onSubmit,
  submitting,
}: ProposalFormProps) {
  return (
    <Fragment>
      <Text>
        <Muted>
          <Bold>{String(diffItems.length)}</Bold> change
          {diffItems.length === 1 ? "" : "s"} to propose:
        </Muted>
      </Text>
      <VerticalSpace space="small" />
      <DiffList items={diffItems} mode="proposals" />

      <VerticalSpace space="medium" />
      <Text>
        <Muted>Description</Muted>
      </Text>
      <VerticalSpace space="extraSmall" />
      <TextboxMultiline
        value={description}
        onValueInput={onDescriptionChange}
        placeholder="What changed in this proposal?"
        rows={3}
      />
      <VerticalSpace space="small" />
      <Button
        onClick={onSubmit}
        loading={submitting}
        disabled={!description.trim()}
        fullWidth
      >
        Propose Changes
      </Button>
    </Fragment>
  );
}
