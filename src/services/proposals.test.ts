import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@services/figmaMessages", () => ({ requestExport: vi.fn(), requestImport: vi.fn() }));

import { requestExport, requestImport } from "@services/figmaMessages";
import { checkActiveProposalStatus, checkForProposalChanges, resolveDeadProposal, submitProposal } from "./proposals";
import { computeDiff } from "@common/diff";
import { NamingCollisionError } from "@common/dtcg";
import { color } from "@common/testUtils/tokens";
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
  skipSwitchConfirmation: false,
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

  it("reuses an already-fetched proposals list instead of fetching its own when knownProposals is passed", async () => {
    vi.mocked(requestExport).mockResolvedValue("{}");
    const github = createMockGitHub();
    const knownProposals = [{ number: 5, title: "x", state: "open", html_url: "u", head_ref: "figma/proposal-1" }];

    const result = await checkForProposalChanges(settings, github, null, knownProposals);

    expect(github.listPullRequests).not.toHaveBeenCalled();
    expect(result.proposals).toBe(knownProposals);
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
    expect(pr).toEqual({ number: 1, html_url: "https://github.com/pull/1", head_ref: branchName, gitContent: writtenContent });
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
    const [, , writtenContent, sha, branchName] = github.updateFile.mock.calls[0];
    expect(sha).toBe("pr-sha");
    expect(branchName).toBe("figma/proposal-1");
    expect(pr).toEqual({
      number: 5,
      html_url: "https://github.com/pull/5",
      head_ref: "figma/proposal-1",
      gitContent: writtenContent,
    });
  });

  it("throws instead of silently overwriting the PR when its branch no longer exists", async () => {
    const github = createMockGitHub({ getFile: vi.fn().mockResolvedValue(null) });

    await expect(
      submitProposal(settings, github, "{}", [], "description", activeProposal)
    ).rejects.toThrow(/no longer available/);

    expect(github.updateFile).not.toHaveBeenCalled();
  });
});

describe("resolveDeadProposal", () => {
  beforeEach(() => {
    vi.mocked(requestExport).mockReset();
    vi.mocked(requestImport).mockReset();
  });

  it("applies the safe subset from main, excluding a path the designer already drifted locally", async () => {
    const oldGitContent = JSON.stringify({
      Tokens: { brand: { primary: color("#fff"), secondary: color("#f00") } },
    });
    const mainContent = JSON.stringify({
      Tokens: { brand: { primary: color("#000"), secondary: color("#f00") } },
    });
    const staleFigmaContent = JSON.stringify({
      Tokens: { brand: { primary: color("#fff"), secondary: color("#0f0") } },
    });
    const liveFigmaContent = JSON.stringify({
      Tokens: { brand: { primary: color("#fff"), secondary: color("#0f0") }, tertiary: color("#123456") },
    });
    const staleDiffs = [
      { path: ["Tokens", "brand", "secondary"], dotPath: "Tokens.brand.secondary", type: "modified" as const, figmaVal: "#0f0", gitVal: "#f00" },
    ];
    const github = createMockGitHub({ getFile: vi.fn().mockResolvedValue({ content: mainContent, sha: "main-sha" }) });
    vi.mocked(requestImport).mockResolvedValue({ success: true, message: "Imported.", quarantined: [] });
    vi.mocked(requestExport).mockResolvedValueOnce(liveFigmaContent).mockResolvedValueOnce(mainContent);

    const result = await resolveDeadProposal(settings, github, {
      diffs: staleDiffs,
      figmaContent: staleFigmaContent,
      gitContent: oldGitContent,
      proposals: [],
      collisionNotice: null,
      primaryModeName: "Default",
    });

    expect(github.getFile).toHaveBeenCalledWith(settings);
    expect(JSON.parse(vi.mocked(requestImport).mock.calls[0][0])).toEqual({
      Tokens: { brand: { primary: color("#000"), secondary: color("#0f0") }, tertiary: color("#123456") },
    });
    expect(result.count).toBe(1);
    expect(result.gitContent).toBe(mainContent);
  });
});

describe("checkActiveProposalStatus", () => {
  beforeEach(() => {
    vi.mocked(requestExport).mockReset();
    vi.mocked(requestImport).mockReset();
  });

  const activeProposal = { number: 5, title: "x", html_url: "u", head_ref: "figma/proposal-1" };

  it("does an ordinary check with no resolution when there's no active proposal", async () => {
    const github = createMockGitHub();
    vi.mocked(requestExport).mockResolvedValue("{}");

    const { result, resolvedDeadProposal } = await checkActiveProposalStatus(settings, github, null, null);

    expect(github.listPullRequests).toHaveBeenCalledTimes(1);
    expect(resolvedDeadProposal).toBeNull();
    expect(result.diffs).toEqual([]);
  });

  it("does an ordinary check with no resolution when the active proposal is still open", async () => {
    const github = createMockGitHub({
      listPullRequests: vi.fn().mockResolvedValue([{ number: 5, title: "x", state: "open", html_url: "u", head_ref: "figma/proposal-1" }]),
    });
    vi.mocked(requestExport).mockResolvedValue("{}");

    const { resolvedDeadProposal } = await checkActiveProposalStatus(settings, github, activeProposal, null);

    expect(resolvedDeadProposal).toBeNull();
    expect(github.listPullRequests).toHaveBeenCalledTimes(1);
  });

  it("resolves and reports a merged proposal, falling back to main", async () => {
    const oldGitContent = JSON.stringify({ Tokens: { brand: { primary: color("#fff") } } });
    const mainContent = JSON.stringify({ Tokens: { brand: { primary: color("#000") } } });
    const github = createMockGitHub({
      listPullRequests: vi.fn().mockResolvedValue([{ number: 5, title: "x", state: "merged", html_url: "u", head_ref: "figma/proposal-1" }]),
      getFile: vi.fn().mockResolvedValue({ content: mainContent, sha: "main-sha" }),
    });
    vi.mocked(requestImport).mockResolvedValue({ success: true, message: "Imported.", quarantined: [] });
    vi.mocked(requestExport).mockResolvedValueOnce(oldGitContent).mockResolvedValueOnce(mainContent);

    const { result, resolvedDeadProposal } = await checkActiveProposalStatus(settings, github, activeProposal, {
      diffs: [],
      figmaContent: oldGitContent,
      gitContent: oldGitContent,
      proposals: [],
      collisionNotice: null,
      primaryModeName: "Default",
    });

    expect(resolvedDeadProposal).toEqual({ number: 5, reason: "merged", count: 1 });
    expect(result.gitContent).toBe(mainContent);
  });

  it("reports a closed (not merged) proposal as 'closed', not 'merged'", async () => {
    const github = createMockGitHub({
      listPullRequests: vi.fn().mockResolvedValue([{ number: 5, title: "x", state: "closed", html_url: "u", head_ref: "figma/proposal-1" }]),
    });
    vi.mocked(requestImport).mockResolvedValue({ success: true, message: "Imported.", quarantined: [] });
    vi.mocked(requestExport).mockResolvedValue("{}");

    const { resolvedDeadProposal } = await checkActiveProposalStatus(settings, github, activeProposal, {
      diffs: [],
      figmaContent: "{}",
      gitContent: "{}",
      proposals: [],
      collisionNotice: null,
      primaryModeName: "Default",
    });

    expect(resolvedDeadProposal?.reason).toBe("closed");
  });

  it("reports 'closed' when the proposal has vanished from the list entirely", async () => {
    const github = createMockGitHub({ listPullRequests: vi.fn().mockResolvedValue([]) });
    vi.mocked(requestImport).mockResolvedValue({ success: true, message: "Imported.", quarantined: [] });
    vi.mocked(requestExport).mockResolvedValue("{}");

    const { resolvedDeadProposal } = await checkActiveProposalStatus(settings, github, activeProposal, {
      diffs: [],
      figmaContent: "{}",
      gitContent: "{}",
      proposals: [],
      collisionNotice: null,
      primaryModeName: "Default",
    });

    expect(resolvedDeadProposal?.reason).toBe("closed");
  });

  it("falls back to a fresh checkForProposalChanges call when there's no last-good result to reuse", async () => {
    const github = createMockGitHub({
      listPullRequests: vi.fn().mockResolvedValue([{ number: 5, title: "x", state: "merged", html_url: "u", head_ref: "figma/proposal-1" }]),
    });
    vi.mocked(requestImport).mockResolvedValue({ success: true, message: "Imported.", quarantined: [] });
    vi.mocked(requestExport).mockResolvedValue("{}");

    const { resolvedDeadProposal } = await checkActiveProposalStatus(settings, github, activeProposal, null);

    expect(github.getFile).toHaveBeenCalledWith({ ...settings, branch: activeProposal.head_ref });
    expect(resolvedDeadProposal).not.toBeNull();
  });
});
