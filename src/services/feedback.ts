import { GitHubService } from "@services/github";

export const FEEDBACK_REPO = { owner: "ollypolly", repo: "figma-variables-sync" } as const;

export type FeedbackType = "bug" | "feature";

function buildIssue(type: FeedbackType, description: string) {
  const trimmed = description.trim();
  const summary = trimmed.length > 60 ? `${trimmed.slice(0, 60)}…` : trimmed;
  const title = `[${type === "bug" ? "Bug" : "Feature"}] ${summary}`;
  const body = `${trimmed}\n\n---\n_Filed via the figma-variables-sync plugin's in-app feedback form._`;
  const labels = [type === "bug" ? "bug" : "enhancement", "design-feedback"];
  return { title, body, labels };
}

export async function submitFeedback(
  pat: string,
  type: FeedbackType,
  description: string
): Promise<{ number: number; html_url: string }> {
  if (!pat) throw new Error("No GitHub personal access token configured in Settings.");
  const github = new GitHubService(pat);
  const { title, body, labels } = buildIssue(type, description);
  return github.createIssue(FEEDBACK_REPO.owner, FEEDBACK_REPO.repo, title, body, labels);
}
