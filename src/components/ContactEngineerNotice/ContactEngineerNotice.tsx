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

// Figma's plugin UI iframe doesn't reliably grant the Clipboard API's write permission,
// so navigator.clipboard.writeText() can silently reject. Fall back to the older
// execCommand('copy') route, which works via a hidden textarea + user gesture instead.
async function copyToClipboard(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // fall through to the legacy approach below
    }
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  const success = document.execCommand("copy");
  document.body.removeChild(textarea);
  return success;
}

export function ContactEngineerNotice({
  message,
  details,
  action,
  onDismiss,
}: ContactEngineerNoticeProps) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");

  const handleCopy = async () => {
    const success = await copyToClipboard(formatDetailsForClipboard(message, details));
    setCopyState(success ? "copied" : "failed");
    setTimeout(() => setCopyState("idle"), 2000);
  };

  return (
    <Banner icon={<IconWarning16 />} variant="warning">
      <div class="flex flex-col gap-2 py-1">
        <span>{message}</span>
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
          <Button secondary onClick={handleCopy}>
            {copyState === "copied"
              ? "Copied!"
              : copyState === "failed"
                ? "Copy failed"
                : "Copy details"}
          </Button>
          {action && <Button secondary onClick={action.onClick}>{action.label}</Button>}
          {onDismiss && <Button secondary onClick={onDismiss}>Dismiss</Button>}
        </div>
      </div>
    </Banner>
  );
}
