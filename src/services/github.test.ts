import { describe, it, expect, vi, beforeEach } from "vitest";
import { GitHubService } from "./github";

const mockRequest = vi.fn();

vi.mock("@octokit/core", () => {
  return {
    Octokit: class {
      request = mockRequest;
    }
  };
});

describe("GitHubService", () => {
  let service: GitHubService;
  const config = {
    owner: "test-owner",
    repo: "test-repo",
    filePath: "tokens.json",
    branch: "main",
  };

  beforeEach(() => {
    mockRequest.mockReset();
    service = new GitHubService("test-pat");
  });

  describe("getFile", () => {
    it("should return content and sha on success", async () => {
      const jsonStr = JSON.stringify({ a: 1 });
      const base64Str = btoa(jsonStr);

      mockRequest.mockResolvedValueOnce({
        data: {
          type: "file",
          content: base64Str,
          sha: "file-sha",
        },
      });

      const result = await service.getFile(config);
      expect(result).toEqual({
        content: jsonStr,
        sha: "file-sha",
      });
      expect(mockRequest).toHaveBeenCalledWith(
        "GET /repos/{owner}/{repo}/contents/{path}",
        {
          owner: "test-owner",
          repo: "test-repo",
          path: "tokens.json",
          ref: "main",
        }
      );
    });

    it("should return null when GitHub API returns 404", async () => {
      const error: any = new Error("Not Found");
      error.status = 404;
      mockRequest.mockRejectedValueOnce(error);

      const result = await service.getFile(config);
      expect(result).toBeNull();
    });

    it("should throw an error when target is a directory", async () => {
      mockRequest.mockResolvedValueOnce({
        data: [
          { name: "file1.json", type: "file" },
          { name: "file2.json", type: "file" },
        ],
      });

      await expect(service.getFile(config)).rejects.toThrow(
        "Target file path is a directory, not a file."
      );
    });

    it("should throw an error when target type is not file", async () => {
      mockRequest.mockResolvedValueOnce({
        data: {
          type: "symlink",
          sha: "some-sha",
        },
      });

      await expect(service.getFile(config)).rejects.toThrow(
        "Target is not a file."
      );
    });
  });

  describe("getLatestCommitSha", () => {
    it("should fetch latest commit SHA of a branch", async () => {
      mockRequest.mockResolvedValueOnce({
        data: {
          object: {
            sha: "commit-sha-123",
          },
        },
      });

      const sha = await service.getLatestCommitSha("owner", "repo", "branch");
      expect(sha).toBe("commit-sha-123");
      expect(mockRequest).toHaveBeenCalledWith(
        "GET /repos/{owner}/{repo}/git/ref/heads/{ref}",
        {
          owner: "owner",
          repo: "repo",
          ref: "branch",
        }
      );
    });
  });

  describe("createBranch", () => {
    it("should get latest commit sha and then create the branch ref", async () => {
      mockRequest
        // mock getLatestCommitSha request
        .mockResolvedValueOnce({
          data: {
            object: {
              sha: "base-commit-sha",
            },
          },
        })
        // mock create ref request
        .mockResolvedValueOnce({
          data: {},
        });

      await service.createBranch(config, "feature/new-branch");

      expect(mockRequest).toHaveBeenCalledTimes(2);
      expect(mockRequest).toHaveBeenLastCalledWith(
        "POST /repos/{owner}/{repo}/git/refs",
        {
          owner: "test-owner",
          repo: "test-repo",
          ref: "refs/heads/feature/new-branch",
          sha: "base-commit-sha",
        }
      );
    });
  });

  describe("updateFile", () => {
    it("should update/commit the file contents and return commit sha", async () => {
      mockRequest.mockResolvedValueOnce({
        data: {
          commit: {
            sha: "new-commit-sha",
          },
        },
      });

      const content = "hello world";
      const resultSha = await service.updateFile(
        config,
        "commit message",
        content,
        "old-file-sha",
        "feature/new-branch"
      );

      expect(resultSha).toBe("new-commit-sha");
      expect(mockRequest).toHaveBeenCalledWith(
        "PUT /repos/{owner}/{repo}/contents/{path}",
        {
          owner: "test-owner",
          repo: "test-repo",
          path: "tokens.json",
          message: "commit message",
          content: btoa(content),
          sha: "old-file-sha",
          branch: "feature/new-branch",
        }
      );
    });
  });

  describe("createPullRequest", () => {
    it("should create PR, apply the given labels, and return PR number and HTML URL", async () => {
      mockRequest
        .mockResolvedValueOnce({
          data: {
            number: 42,
            html_url: "https://github.com/pull/42",
          },
        })
        .mockResolvedValueOnce({ data: [] });

      const result = await service.createPullRequest(
        config,
        "pr title",
        "pr body",
        "feature/new-branch",
        ["patch"]
      );

      expect(result).toEqual({
        number: 42,
        html_url: "https://github.com/pull/42",
      });
      expect(mockRequest).toHaveBeenNthCalledWith(
        1,
        "POST /repos/{owner}/{repo}/pulls",
        {
          owner: "test-owner",
          repo: "test-repo",
          title: "pr title",
          body: "pr body",
          head: "feature/new-branch",
          base: "main",
        }
      );
      expect(mockRequest).toHaveBeenNthCalledWith(
        2,
        "POST /repos/{owner}/{repo}/issues/{issue_number}/labels",
        {
          owner: "test-owner",
          repo: "test-repo",
          issue_number: 42,
          labels: ["patch"],
        }
      );
    });

    it("should skip the labels request when no labels are given", async () => {
      mockRequest.mockResolvedValueOnce({
        data: {
          number: 42,
          html_url: "https://github.com/pull/42",
        },
      });

      await service.createPullRequest(
        config,
        "pr title",
        "pr body",
        "feature/new-branch",
        []
      );

      expect(mockRequest).toHaveBeenCalledTimes(1);
    });
  });

  describe("verifyConnection", () => {
    it("should return true if repository check succeeds", async () => {
      mockRequest.mockResolvedValueOnce({ data: {} });
      const success = await service.verifyConnection("owner", "repo");
      expect(success).toBe(true);
    });

    it("should return false if repository check throws", async () => {
      mockRequest.mockRejectedValueOnce(new Error("Repo not found"));
      const success = await service.verifyConnection("owner", "repo");
      expect(success).toBe(false);
    });
  });

  describe("listPullRequests", () => {
    it("should return only PRs from figma/proposal- branches", async () => {
      mockRequest.mockResolvedValueOnce({
        data: [
          {
            number: 5,
            title: "PR 5",
            state: "open",
            merged_at: null,
            html_url: "url-5",
            head: { ref: "figma/proposal-123" },
          },
          {
            number: 6,
            title: "Unrelated PR",
            state: "closed",
            merged_at: "2026-06-18T12:00:00Z",
            html_url: "url-6",
            head: { ref: "some-other-branch" },
          },
        ],
      });

      const list = await service.listPullRequests("owner", "repo", "main");
      expect(list).toEqual([
        {
          number: 5,
          title: "PR 5",
          state: "open",
          html_url: "url-5",
          head_ref: "figma/proposal-123",
        },
      ]);
      expect(mockRequest).toHaveBeenCalledWith(
        "GET /repos/{owner}/{repo}/pulls",
        {
          owner: "owner",
          repo: "repo",
          base: "main",
          state: "all",
          sort: "created",
          direction: "desc",
          per_page: 30,
        }
      );
    });
  });
});
