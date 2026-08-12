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
        placeholder={
          activeProposal
            ? 'What did you change in this push? e.g. "Fixed the contrast ratio flagged in review"'
            : 'What\'s changing and why? e.g. "Darkened the primary brand color for better contrast on light backgrounds"'
        }
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
