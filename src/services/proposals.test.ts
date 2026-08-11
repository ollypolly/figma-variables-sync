import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@services/figmaMessages", () => ({ requestExport: vi.fn() }));

import { requestExport } from "@services/figmaMessages";
import { checkForProposalChanges, submitProposal } from "./proposals";
import { computeDiff } from "@common/diff";
import { NamingCollisionError } from "@common/dtcg";
import type { PluginSettings } from "../types";

function createMockGitHub(overrides: Record<string, any> = {}) {
  return {
    getFile: vi.fn().mockResolvedValue({ content: "{}", sha: "base-sha" }),
    listPullRequests: vi.fn().mockResolvedValue([]),
    createBranch: vi.fn().mockResolvedValue(undefined),
    updateFile: vi.fn().mockResolvedValue("new-commit-sha"),
    createPullRequest: vi.fn().mockResolvedValue({ number: 1, html_url: "https://github.com/pull/1" }),
    ...overrides,
  } as any;
}

const settings: PluginSettings = {
  pat: "test-pat",
  owner: "owner",
  repo: "repo",
  filePath: "tokens.json",
  branch: "main",
  prLabels: "",
};

describe("checkForProposalChanges", () => {
  beforeEach(() => {
    vi.mocked(requestExport).mockReset();
  });

  it("returns diffs and open proposals for the happy path", async () => {
    const gitTokens = JSON.stringify({ Tokens: { brand: { primary: { $type: "color", $value: "#fff" } } } });
    const figmaTokens = JSON.stringify({ Tokens: { brand: { primary: { $type: "color", $value: "#000" } } } });
    vi.mocked(requestExport).mockResolvedValue(figmaTokens);

    const github = createMockGitHub({
      getFile: vi.fn().mockResolvedValue({ content: gitTokens, sha: "base-sha" }),
      listPullRequests: vi.fn().mockResolvedValue([{ number: 5, title: "x", state: "open", html_url: "u", head_ref: "figma/proposal-1" }]),
    });

    const result = await checkForProposalChanges(settings, github);

    expect(result.diffs).toHaveLength(1);
    expect(result.diffs[0].dotPath).toBe("Tokens.brand.primary");
    expect(result.figmaContent).toBe(figmaTokens);
    expect(result.proposals).toHaveLength(1);
    expect(result.collisionNotice).toBeNull();
  });

  it("surfaces a designer-resolution collision notice without throwing when export finds a naming collision", async () => {
    vi.mocked(requestExport).mockRejectedValue(new NamingCollisionError("Colliding names.", ["Tokens.Primary"]));
    const github = createMockGitHub();

    const result = await checkForProposalChanges(settings, github);

    expect(result.diffs).toEqual([]);
    expect(result.collisionNotice).toEqual({
      message: "Colliding names.",
      paths: ["Tokens.Primary"],
      resolution: "designer",
    });
  });

  it("surfaces an engineer-resolution collision notice alongside real diffs when computeDiff finds quarantined paths", async () => {
    const gitTokens = JSON.stringify({
      Tokens: {
        brand: {
          primary: { $value: "#fff", weird: {} }, // quarantined: $value + non-$ child
          secondary: { $type: "color", $value: "#f00" },
        },
      },
    });
    const figmaTokens = JSON.stringify({
      Tokens: { brand: { secondary: { $type: "color", $value: "#000" } } },
    });
    vi.mocked(requestExport).mockResolvedValue(figmaTokens);
    const github = createMockGitHub({ getFile: vi.fn().mockResolvedValue({ content: gitTokens, sha: "s" }) });

    const result = await checkForProposalChanges(settings, github);

    expect(result.diffs).toHaveLength(1);
    expect(result.diffs[0].dotPath).toBe("Tokens.brand.secondary");
    expect(result.collisionNotice?.resolution).toBe("engineer");
    expect(result.collisionNotice?.paths).toEqual(["Tokens.brand.primary"]);
  });
});

describe("submitProposal", () => {
  it("creates a branch, writes the merged (not raw) content, and returns the created PR", async () => {
    const gitTokens = JSON.stringify({
      Tokens: { brand: { primary: { $type: "color", $value: "#fff" } } },
      // Invalid/quarantined subtree the exporter never produces — must survive the merge
      // untouched, which a naive "write the raw Figma export" submit would have dropped.
      Notes: { readme: { $value: "hand-authored", weird: {} } },
    });
    const figmaTokens = JSON.stringify({
      Tokens: { brand: { primary: { $type: "color", $value: "#000" } } },
    });
    const { diffs } = computeDiff(figmaTokens, gitTokens, "proposals");
    const github = createMockGitHub({ getFile: vi.fn().mockResolvedValue({ content: gitTokens, sha: "base-sha" }) });

    const pr = await submitProposal(settings, github, figmaTokens, diffs, "Update brand primary");

    expect(github.createBranch).toHaveBeenCalledWith(settings, expect.stringContaining("figma/proposal-"));
    expect(github.updateFile).toHaveBeenCalledTimes(1);
    const [, , writtenContent, sha, branchName] = github.updateFile.mock.calls[0];
    expect(sha).toBe("base-sha");
    expect(JSON.parse(writtenContent)).toEqual({
      Tokens: { brand: { primary: { $type: "color", $value: "#000" } } },
      Notes: { readme: { $value: "hand-authored", weird: {} } },
    });
    expect(github.createPullRequest).toHaveBeenCalledWith(
      settings,
      "Update brand primary",
      expect.stringContaining("Update brand primary"),
      branchName,
      []
    );
    expect(pr).toEqual({ number: 1, html_url: "https://github.com/pull/1" });
  });
});
