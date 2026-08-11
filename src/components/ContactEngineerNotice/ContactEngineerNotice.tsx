import { Banner, IconWarning16 } from "@create-figma-plugin/ui";
import { h } from "preact";
import type { ComponentChildren } from "preact";
import { useState } from "preact/hooks";

// Structured detail payload for the "Copy details" button.
export interface NoticeDetails {
  paths?: string[];
  file?: string;
  branch?: string;
  error?: string;
  // Concrete steps for whoever has to actually resolve this (typically an
  // engineer) — kept out of the visible banner so it doesn't clutter the
  // on-screen message for readers who don't need it, but included in the
  // copyable text so it travels with the report into Slack/Teams/etc.
  fixInstructions?: string;
}

interface ContactEngineerNoticeProps {
  message: string;
  // Who can actually resolve this — surfaced as a bold lead-in so it's obvious
  // at a glance whether to fix it yourself or hand it off, without reading the
  // whole message first.
  resolution?: "designer" | "engineer";
  details?: NoticeDetails;
  action?: { label: string; onClick: () => void };
  onDismiss?: () => void;
}

const RESOLUTION_LABEL: Record<"designer" | "engineer", string> = {
  designer: "You can fix this:",
  engineer: "Needs an engineer:",
};

// Button/Link from @create-figma-plugin/ui hardcode colors meant for the default
// app background, not a colored Banner — nesting them here would be unreadable
// (e.g. white button text on this yellow warning). Use the banner's own
// "onwarning" text token directly instead.
function NoticeButton({
  onClick,
  children,
}: {
  onClick: () => void;
  children: ComponentChildren;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        height: "24px",
        padding: "0 8px",
        borderRadius: "6px",
        border: "1px solid var(--figma-color-text-onwarning)",
        background: "transparent",
        color: "var(--figma-color-text-onwarning)",
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
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

  if (details?.fixInstructions) {
    lines.push("", "How to fix:", details.fixInstructions);
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
  resolution,
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
            {copyState === "copied"
              ? "Copied!"
              : copyState === "failed"
                ? "Copy failed"
                : "Copy details"}
          </NoticeButton>
          {action && <NoticeButton onClick={action.onClick}>{action.label}</NoticeButton>}
          {onDismiss && <NoticeButton onClick={onDismiss}>Dismiss</NoticeButton>}
        </div>
      </div>
    </Banner>
  );
}
