import { GitHubService } from "@services/github";
import { describeGitHubError } from "@services/githubErrors";

export const FEEDBACK_REPO = { owner: "ollypolly", repo: "figma-variables-sync" } as const;

export type FeedbackType = "bug" | "feature";

function buildIssue(type: FeedbackType, title: string, description: string) {
  const trimmed = description.trim();
  const issueTitle = `[${type === "bug" ? "Bug" : "Feature"}] ${title.trim()}`;
  const body = `${trimmed}\n\n---\n_Filed via the figma-variables-sync plugin's in-app feedback form._`;
  const labels = [type === "bug" ? "bug" : "enhancement", "design-feedback"];
  return { title: issueTitle, body, labels };
}

export async function submitFeedback(
  pat: string,
  type: FeedbackType,
  title: string,
  description: string
): Promise<{ number: number; html_url: string }> {
  if (!pat) throw new Error("No GitHub personal access token configured in Settings.");
  const github = new GitHubService(pat);
  const { title: issueTitle, body, labels } = buildIssue(type, title, description);
  try {
    return await github.createIssue(FEEDBACK_REPO.owner, FEEDBACK_REPO.repo, issueTitle, body, labels);
  } catch (e) {
    throw new Error(
      describeGitHubError(e, {
        owner: FEEDBACK_REPO.owner,
        repo: FEEDBACK_REPO.repo,
        requiredPermission: "Issues: Read and write",
      })
    );
  }
}
