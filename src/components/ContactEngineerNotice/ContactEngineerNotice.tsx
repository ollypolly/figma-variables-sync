import { Banner, Button, IconWarning16 } from "@create-figma-plugin/ui";
import { h } from "preact";
import { useState } from "preact/hooks";

import type { NoticeDetails } from "@hooks/useAppContext";

interface ContactEngineerNoticeProps {
  message: string;
  details?: NoticeDetails;
  action?: { label: string; onClick: () => void };
  onDismiss?: () => void;
}

// Formats a notice's message + structured details into plain text for pasting into Slack/Teams.
function formatDetailsForClipboard(message: string, details?: NoticeDetails): string {
  const lines = [message];

  if (details?.paths?.length) {
    lines.push("", "Affected paths:", ...details.paths.map((path) => `  - ${path}`));
  }

  if (details?.file || details?.branch) {
    const location = [details.file, details.branch && `(branch: ${details.branch})`]
      .filter(Boolean)
      .join(" ");
    lines.push("", `File: ${location}`);
  }

  if (details?.error) {
    lines.push("", `Error: ${details.error}`);
  }

  return lines.join("\n");
}

export function ContactEngineerNotice({
  message,
  details,
  action,
  onDismiss,
}: ContactEngineerNoticeProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(formatDetailsForClipboard(message, details));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Banner icon={<IconWarning16 />} variant="warning">
      <div class="flex flex-col gap-2 py-1">
        <span>{message}</span>
        <div class="flex gap-2">
          <Button secondary onClick={handleCopy}>
            {copied ? "Copied!" : "Copy details"}
          </Button>
          {action && <Button secondary onClick={action.onClick}>{action.label}</Button>}
          {onDismiss && <Button secondary onClick={onDismiss}>Dismiss</Button>}
        </div>
      </div>
    </Banner>
  );
}
