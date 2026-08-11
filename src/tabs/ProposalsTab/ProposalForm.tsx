import { Button, TextboxMultiline } from '@create-figma-plugin/ui';
import { Fragment, h } from 'preact';

interface ProposalFormProps {
  description: string;
  onDescriptionChange: (value: string) => void;
  onSubmit: () => void;
  submitting: boolean;
}

export function ProposalForm({
  description,
  onDescriptionChange,
  onSubmit,
  submitting,
}: ProposalFormProps) {
  return (
    <Fragment>
      <TextboxMultiline
        value={description}
        onValueInput={onDescriptionChange}
        placeholder="What changed in this proposal?"
        rows={3}
      />
      <Button
        onClick={onSubmit}
        loading={submitting}
        disabled={!description.trim()}
        fullWidth
      >
        Create Pull Request
      </Button>
    </Fragment>
  );
}
