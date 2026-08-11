import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@services/figmaMessages", () => ({ requestExport: vi.fn() }));

import { requestExport } from "@services/figmaMessages";
import { checkFigmaChanges, checkForProposalChanges, resolveDiffSettings, submitProposal } from "./proposals";
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

    const result = await checkForProposalChanges(settings, github, null);

    expect(result.diffs).toHaveLength(1);
    expect(result.diffs[0].dotPath).toBe("Tokens.brand.primary");
    expect(result.figmaContent).toBe(figmaTokens);
    expect(result.gitContent).toBe(gitTokens);
    expect(result.proposals).toHaveLength(1);
    expect(result.collisionNotice).toBeNull();
  });

  it("surfaces a designer-resolution collision notice without throwing when export finds a naming collision", async () => {
    vi.mocked(requestExport).mockRejectedValue(new NamingCollisionError("Colliding names.", ["Tokens.Primary"]));
    const github = createMockGitHub();

    const result = await checkForProposalChanges(settings, github, null);

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

    const result = await checkForProposalChanges(settings, github, null);

    expect(result.diffs).toHaveLength(1);
    expect(result.diffs[0].dotPath).toBe("Tokens.brand.secondary");
    expect(result.collisionNotice?.resolution).toBe("engineer");
    expect(result.collisionNotice?.paths).toEqual(["Tokens.brand.primary"]);
    expect(result.collisionNotice?.fixInstructions).toContain("branch: main");
  });

  it("diffs against the active proposal's branch instead of main, and its fixInstructions cite that branch", async () => {
    const quarantinedPrBranchTokens = JSON.stringify({
      Tokens: {
        brand: {
          primary: { $value: "#fff", weird: {} },
        },
      },
    });
    const mainTokens = JSON.stringify({ Tokens: { brand: { primary: { $type: "color", $value: "#eee" } } } });
    const figmaTokens = JSON.stringify({ Tokens: { brand: { primary: { $type: "color", $value: "#000" } } } });
    vi.mocked(requestExport).mockResolvedValue(figmaTokens);

    const getFile = vi.fn().mockImplementation((cfg: { branch: string }) =>
      cfg.branch === "figma/proposal-1"
        ? Promise.resolve({ content: quarantinedPrBranchTokens, sha: "pr-sha" })
        : Promise.resolve({ content: mainTokens, sha: "main-sha" })
    );
    const github = createMockGitHub({ getFile });

    const activeProposal = {
      number: 5,
      title: "x",
      html_url: "https://github.com/pull/5",
      head_ref: "figma/proposal-1",
    };
    const result = await checkForProposalChanges(settings, github, activeProposal);

    expect(getFile).toHaveBeenCalledWith(expect.objectContaining({ branch: "figma/proposal-1" }));
    expect(result.collisionNotice?.resolution).toBe("engineer");
    expect(result.collisionNotice?.fixInstructions).toContain("branch: figma/proposal-1");
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

    const pr = await submitProposal(settings, github, figmaTokens, diffs, "Update brand primary", null);

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
    expect(pr).toEqual({ number: 1, html_url: "https://github.com/pull/1", head_ref: branchName });
  });
});

describe("submitProposal with an active proposal", () => {
  const activeProposal = {
    number: 5,
    title: "Existing PR",
    html_url: "https://github.com/pull/5",
    head_ref: "figma/proposal-1",
  };

  it("pushes onto the PR's existing branch instead of creating a new one, using that branch's own sha", async () => {
    const prBranchTokens = JSON.stringify({ Tokens: { brand: { primary: { $type: "color", $value: "#fff" } } } });
    const figmaTokens = JSON.stringify({ Tokens: { brand: { primary: { $type: "color", $value: "#000" } } } });
    const { diffs } = computeDiff(figmaTokens, prBranchTokens, "proposals");

    const getFile = vi.fn().mockImplementation((cfg: { branch: string }) =>
      cfg.branch === "figma/proposal-1"
        ? Promise.resolve({ content: prBranchTokens, sha: "pr-sha" })
        : Promise.resolve({ content: "{}", sha: "main-sha" })
    );
    const github = createMockGitHub({ getFile });

    const pr = await submitProposal(settings, github, figmaTokens, diffs, "More brand updates", activeProposal);

    expect(github.createBranch).not.toHaveBeenCalled();
    expect(github.createPullRequest).not.toHaveBeenCalled();
    expect(getFile).toHaveBeenCalledWith(expect.objectContaining({ branch: "figma/proposal-1" }));
    expect(github.updateFile).toHaveBeenCalledWith(
      settings,
      "More brand updates",
      expect.any(String),
      "pr-sha",
      "figma/proposal-1"
    );
    expect(pr).toEqual({ number: 5, html_url: "https://github.com/pull/5", head_ref: "figma/proposal-1" });
  });

  it("throws instead of silently overwriting the PR when its branch no longer exists", async () => {
    const github = createMockGitHub({ getFile: vi.fn().mockResolvedValue(null) });

    await expect(
      submitProposal(settings, github, "{}", [], "description", activeProposal)
    ).rejects.toThrow(/no longer available/);

    expect(github.updateFile).not.toHaveBeenCalled();
  });
});

describe("checkFigmaChanges", () => {
  beforeEach(() => {
    vi.mocked(requestExport).mockReset();
  });

  it("re-diffs Figma's current export against an already-fetched git baseline, with no GitHub calls", async () => {
    const gitTokens = JSON.stringify({ Tokens: { brand: { primary: { $type: "color", $value: "#fff" } } } });
    const figmaTokens = JSON.stringify({ Tokens: { brand: { primary: { $type: "color", $value: "#000" } } } });
    vi.mocked(requestExport).mockResolvedValue(figmaTokens);

    const result = await checkFigmaChanges(gitTokens, settings);

    expect(result.diffs).toHaveLength(1);
    expect(result.diffs[0].dotPath).toBe("Tokens.brand.primary");
    expect(result.figmaContent).toBe(figmaTokens);
    expect(result.collisionNotice).toBeNull();
  });

  it("surfaces a designer-resolution collision notice without throwing when export finds a naming collision", async () => {
    vi.mocked(requestExport).mockRejectedValue(new NamingCollisionError("Colliding names.", ["Tokens.Primary"]));

    const result = await checkFigmaChanges("{}", settings);

    expect(result.diffs).toEqual([]);
    expect(result.collisionNotice).toEqual({
      message: "Colliding names.",
      paths: ["Tokens.Primary"],
      resolution: "designer",
    });
  });

  it("cites the diffSettings branch passed in, not necessarily settings.branch", async () => {
    const gitTokens = JSON.stringify({ Tokens: { brand: { primary: { $value: "#fff", weird: {} } } } });
    vi.mocked(requestExport).mockResolvedValue(JSON.stringify({ Tokens: {} }));

    const result = await checkFigmaChanges(gitTokens, { ...settings, branch: "figma/proposal-1" });

    expect(result.collisionNotice?.fixInstructions).toContain("branch: figma/proposal-1");
  });
});

describe("resolveDiffSettings", () => {
  it("returns settings unchanged when there's no active proposal", () => {
    expect(resolveDiffSettings(settings, null)).toEqual(settings);
  });

  it("overrides branch to the active proposal's head_ref", () => {
    const activeProposal = { number: 5, title: "x", html_url: "u", head_ref: "figma/proposal-1" };
    expect(resolveDiffSettings(settings, activeProposal)).toEqual({ ...settings, branch: "figma/proposal-1" });
  });
});
