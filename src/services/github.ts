import { Octokit } from "@octokit/core";

function utf8ToBase64(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function base64ToUtf8(base64: string): string {
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export interface GitHubConfig {
  pat: string;
  owner: string;
  repo: string;
  filePath: string;
  branch: string;
}

export class GitHubService {
  private octokit: Octokit;

  constructor(pat: string) {
    this.octokit = new Octokit({ auth: pat });
  }

  // Get file content and SHA
  async getFile(config: Omit<GitHubConfig, "pat">) {
    try {
      const response = await this.octokit.request("GET /repos/{owner}/{repo}/contents/{path}", {
        owner: config.owner,
        repo: config.repo,
        path: config.filePath,
        ref: config.branch,
      });

      if (Array.isArray(response.data)) {
        throw new Error("Target file path is a directory, not a file.");
      }

      if (response.data.type !== "file") {
        throw new Error("Target is not a file.");
      }

      const contentBase64 = response.data.content || "";
      const contentClean = contentBase64.replace(/\s/g, "");
      const content = base64ToUtf8(contentClean);

      return {
        content,
        sha: response.data.sha,
      };
    } catch (error: any) {
      if (error.status === 404) {
        return null;
      }
      throw error;
    }
  }

  // Get the latest commit SHA of a branch
  async getLatestCommitSha(owner: string, repo: string, branch: string): Promise<string> {
    const response = await this.octokit.request("GET /repos/{owner}/{repo}/git/ref/heads/{ref}", {
      owner,
      repo,
      ref: branch,
    });
    return response.data.object.sha;
  }

  // Create a new branch pointing to the latest commit of the base branch
  async createBranch(config: Omit<GitHubConfig, "pat">, newBranchName: string): Promise<void> {
    const latestSha = await this.getLatestCommitSha(config.owner, config.repo, config.branch);
    await this.octokit.request("POST /repos/{owner}/{repo}/git/refs", {
      owner: config.owner,
      repo: config.repo,
      ref: `refs/heads/${newBranchName}`,
      sha: latestSha,
    });
  }

  // Commit / update file in a branch
  async updateFile(
    config: Omit<GitHubConfig, "pat">,
    commitMessage: string,
    content: string,
    currentSha: string | undefined,
    branchName: string
  ): Promise<string> {
    const response = await this.octokit.request("PUT /repos/{owner}/{repo}/contents/{path}", {
      owner: config.owner,
      repo: config.repo,
      path: config.filePath,
      message: commitMessage,
      content: utf8ToBase64(content),
      sha: currentSha,
      branch: branchName,
    });
    return response.data.commit.sha!;
  }

  // Create Pull Request
  async createPullRequest(
    config: Omit<GitHubConfig, "pat">,
    prTitle: string,
    prBody: string,
    headBranch: string
  ): Promise<{ number: number; html_url: string }> {
    const response = await this.octokit.request("POST /repos/{owner}/{repo}/pulls", {
      owner: config.owner,
      repo: config.repo,
      title: prTitle,
      body: prBody,
      head: headBranch,
      base: config.branch,
    });
    return {
      number: response.data.number,
      html_url: response.data.html_url,
    };
  }

  // Verify connection by checking repository accessibility
  async verifyConnection(owner: string, repo: string): Promise<boolean> {
    try {
      await this.octokit.request("GET /repos/{owner}/{repo}", {
        owner,
        repo,
      });
      return true;
    } catch (e) {
      console.error("Connection verification failed:", e);
      return false;
    }
  }

  // Fetch pull requests
  async listPullRequests(owner: string, repo: string, base: string) {
    const response = await this.octokit.request("GET /repos/{owner}/{repo}/pulls", {
      owner,
      repo,
      base,
      state: "all",
      sort: "created",
      direction: "desc",
      per_page: 30,
    });
    return response.data.map((pr: any) => ({
      number: pr.number,
      title: pr.title,
      state: pr.merged_at ? "merged" : pr.state, // "open", "closed", "merged"
      html_url: pr.html_url,
      head_ref: pr.head.ref,
    }));
  }
}
