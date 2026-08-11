import { Button, TextboxMultiline } from '@create-figma-plugin/ui';
import { Fragment, h } from 'preact';

import type { ActiveProposal } from '../../types';

interface ProposalFormProps {
  description: string;
  onDescriptionChange: (value: string) => void;
  onSubmit: () => void;
  submitting: boolean;
  activeProposal: ActiveProposal | null;
}

export function ProposalForm({
  description,
  onDescriptionChange,
  onSubmit,
  submitting,
  activeProposal,
}: ProposalFormProps) {
  return (
    <Fragment>
      <TextboxMultiline
        value={description}
        onValueInput={onDescriptionChange}
        placeholder="What's changed?"
        rows={3}
      />
      <Button
        onClick={onSubmit}
        loading={submitting}
        disabled={!description.trim()}
        fullWidth
      >
        {activeProposal ? `Update PR #${activeProposal.number}` : 'Create Pull Request'}
      </Button>
    </Fragment>
  );
}
