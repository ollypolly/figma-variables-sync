import {
  Bold,
  Button,
  Muted,
  Text,
  TextboxMultiline,
  VerticalSpace,
} from "@create-figma-plugin/ui";
import { Fragment, h } from "preact";

interface ProposalFormProps {
  changeCount: number;
  description: string;
  onDescriptionChange: (value: string) => void;
  onSubmit: () => void;
  submitting: boolean;
}

export function ProposalForm({
  changeCount,
  description,
  onDescriptionChange,
  onSubmit,
  submitting,
}: ProposalFormProps) {
  return (
    <Fragment>
      <Text>
        <Muted>
          <Bold>{String(changeCount)}</Bold> change
          {changeCount === 1 ? "" : "s"} to propose:
        </Muted>
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
