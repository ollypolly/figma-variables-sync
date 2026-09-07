import { useStore } from "@nanostores/preact";
import { useState } from "preact/hooks";

import { submitFeedback, type FeedbackType } from "@services/feedback";
import { $settings } from "@stores/settingsStore";

const MIN_DESCRIPTION_LENGTH = 20;
const COOLDOWN_MS = 30_000;

interface FeedbackResult {
  success: boolean;
  text: string;
  link?: string;
}

export function useFeedback() {
  const settings = useStore($settings);
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<FeedbackType>("bug");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<FeedbackResult | null>(null);
  const [cooldown, setCooldown] = useState(false);

  const canSubmit =
    title.trim().length > 0 &&
    description.trim().length >= MIN_DESCRIPTION_LENGTH &&
    !submitting &&
    !result?.success;

  function openModal(): void {
    if (cooldown) return;
    // Only clear the form after a successful submission — otherwise a dismissed
    // draft (or a visible error) should still be there when the user reopens.
    if (result?.success) {
      setType("bug");
      setTitle("");
      setDescription("");
      setResult(null);
    }
    setOpen(true);
  }

  function closeModal(): void {
    setOpen(false);
  }

  async function submit(): Promise<void> {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const issue = await submitFeedback(settings.pat, type, title, description);
      setResult({ success: true, text: `Thanks — issue #${issue.number} filed.`, link: issue.html_url });
      setCooldown(true);
      setTimeout(() => setCooldown(false), COOLDOWN_MS);
    } catch (e) {
      console.error("Feedback submission failed:", e);
      setResult({ success: false, text: e instanceof Error ? e.message : "Failed to send feedback." });
    } finally {
      setSubmitting(false);
    }
  }

  return {
    open,
    openModal,
    closeModal,
    type,
    setType,
    title,
    setTitle,
    description,
    setDescription,
    submitting,
    canSubmit,
    submit,
    result,
    cooldown,
  };
}
