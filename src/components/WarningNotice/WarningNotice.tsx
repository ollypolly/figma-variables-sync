import { Banner, IconWarning16 } from '@create-figma-plugin/ui';
import { h } from 'preact';
import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';

import { copyToClipboard } from '@utils/clipboard';

export interface NoticeDetails {
  paths?: string[];
  file?: string;
  branch?: string;
  url?: string;
  error?: string;
  // Kept out of the visible banner; included only in the copyable text.
  fixInstructions?: string;
}

interface WarningNoticeProps {
  message: string;
  resolution?: 'designer' | 'engineer';
  details?: NoticeDetails;
  action?: { label: string; onClick: () => void; loading?: boolean };
  onDismiss?: () => void;
}

const RESOLUTION_LABEL: Record<'designer' | 'engineer', string> = {
  designer: 'You can fix this:',
  engineer: 'Needs an engineer:',
};

// Button/Link hardcode colors meant for the default background, unreadable on this Banner.
function NoticeButton({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: ComponentChildren;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        height: '24px',
        padding: '0 8px',
        borderRadius: '6px',
        border: '1px solid var(--figma-color-text-onwarning)',
        background: 'transparent',
        color: 'var(--figma-color-text-onwarning)',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {children}
    </button>
  );
}

// Formats a notice's message + structured details into plain text for pasting into Slack/Teams.
function formatDetailsForClipboard(
  message: string,
  details?: NoticeDetails,
): string {
  const lines = [message];

  if (details?.paths?.length) {
    lines.push(
      '',
      'Affected paths:',
      ...details.paths.map((path) => `  - ${path}`),
    );
  }

  if (details?.file) {
    const location = [
      details.file,
      details.branch && `(branch: ${details.branch})`,
    ]
      .filter(Boolean)
      .join(' ');
    lines.push('', `File: ${location}`);
  } else if (details?.branch) {
    lines.push('', `Branch: ${details.branch}`);
  }

  if (details?.url) {
    lines.push('', `Link: ${details.url}`);
  }

  if (details?.error) {
    lines.push('', `Error: ${details.error}`);
  }

  if (details?.fixInstructions) {
    lines.push('', 'How to fix:', details.fixInstructions);
  }

  return lines.join('\n');
}

export function WarningNotice({
  message,
  resolution,
  details,
  action,
  onDismiss,
}: WarningNoticeProps) {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>(
    'idle',
  );

  const handleCopy = async () => {
    const success = await copyToClipboard(
      formatDetailsForClipboard(message, details),
    );
    setCopyState(success ? 'copied' : 'failed');
    setTimeout(() => setCopyState('idle'), 2000);
  };

  return (
    <Banner icon={<IconWarning16 />} variant="warning">
      <div class="flex flex-col gap-2">
        <span>
          {resolution && <strong>{RESOLUTION_LABEL[resolution]} </strong>}
          {message}
        </span>
        {details?.paths && details.paths.length > 0 && (
          <div class="flex flex-col">
            {details.paths.map((path) => (
              <span key={path}>
                <strong>{path}</strong>
              </span>
            ))}
          </div>
        )}
        <div class="flex gap-2">
          <NoticeButton onClick={handleCopy}>
            {copyState === 'copied'
              ? 'Copied!'
              : copyState === 'failed'
                ? 'Copy failed'
                : 'Copy details'}
          </NoticeButton>
          {action && (
            <NoticeButton onClick={action.onClick} disabled={action.loading}>
              {action.loading ? 'Working…' : action.label}
            </NoticeButton>
          )}
          {onDismiss && (
            <NoticeButton onClick={onDismiss}>Dismiss</NoticeButton>
          )}
        </div>
      </div>
    </Banner>
  );
}
