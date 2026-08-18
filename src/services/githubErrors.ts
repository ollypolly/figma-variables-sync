interface GitHubErrorContext {
  owner: string;
  repo: string;
  /** Named only when the failing action needs a specific fine-grained PAT permission, e.g. "Issues: Read and write". */
  requiredPermission?: string;
  /** Used when the error has no message and no status we recognize. */
  fallback?: string;
}

function statusOf(e: unknown): number | undefined {
  const status = (e as { status?: unknown } | undefined)?.status;
  return typeof status === "number" ? status : undefined;
}

// Maps a raw Octokit error (which carries its HTTP status on `.status`) to a message that tells
// the user what to actually do about it, instead of showing Octokit's raw wording. Falls back to
// the original message for anything not worth special-casing.
export function describeGitHubError(e: unknown, context: GitHubErrorContext): string {
  const status = statusOf(e);
  const message = e instanceof Error ? e.message : undefined;
  const repoLabel = `${context.owner}/${context.repo}`;

  if (message && /rate limit/i.test(message)) {
    return "GitHub API rate limit exceeded. Wait a few minutes and try again.";
  }

  switch (status) {
    case 401:
      return "GitHub rejected your personal access token. Check it's valid and not expired in Settings.";
    case 403: {
      const permission = context.requiredPermission ? ` requiring "${context.requiredPermission}"` : "";
      return (
        `GitHub rejected this request to ${repoLabel} as forbidden (403)${permission}. ` +
        `If your PAT normally works, this can also mean GitHub itself is degraded — check https://www.githubstatus.com. ` +
        `Otherwise, grant the PAT access to ${repoLabel} in GitHub.`
      );
    }
    case 404:
      return `${repoLabel} — repository, branch, or file not found. Check Settings match an existing path.`;
    case 409:
    case 422:
      return message ? `GitHub rejected the request: ${message}` : "GitHub rejected the request as invalid.";
    default:
      return message ?? context.fallback ?? "Something went wrong talking to GitHub.";
  }
}

// For call sites that can receive an error from either GitHub or somewhere else entirely (e.g. a
// Figma-side export failure) — only routes to describeGitHubError once the error actually looks
// like it came from GitHub, so a non-GitHub failure doesn't get mislabeled as a connection issue.
export function describeError(e: unknown, context: GitHubErrorContext): string {
  if (statusOf(e) === undefined) {
    return e instanceof Error ? e.message : context.fallback ?? "Something went wrong.";
  }
  return describeGitHubError(e, context);
}
