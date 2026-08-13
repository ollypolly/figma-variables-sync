import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@services/figmaMessages", () => ({ requestExport: vi.fn(), requestImport: vi.fn() }));

import { requestExport, requestImport } from "@services/figmaMessages";
import {
  abandonProposal,
  checkActiveProposalStatus,
  checkForProposalChanges,
  checkProposalStaleness,
  resolveDeadProposal,
  submitProposal,
  updateProposalBranch,
} from "./proposals";
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
    getMergeBaseSha: vi.fn().mockResolvedValue("merge-base-sha"),
    getPullRequest: vi.fn().mockResolvedValue({ mergeable: true, mergeable_state: "clean" }),
    updateBranch: vi.fn().mockResolvedValue(undefined),
    closePullRequest: vi.fn().mockResolvedValue(undefined),
    deleteBranch: vi.fn().mockResolvedValue(undefined),
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

describe("updateProposalBranch", () => {
  const activeProposal = { number: 5, title: "x", html_url: "u", head_ref: "figma/proposal-1" };
  const MERGE_POLL_INTERVAL_MS = 2_000; // mirrors proposals.ts's private constant

  beforeEach(() => {
    vi.mocked(requestExport).mockReset();
    vi.mocked(requestImport).mockReset();
  });

  it("updates the branch, waits for mergeable_state to settle, and applies the safe subset", async () => {
    vi.useFakeTimers();
    try {
      const oldGitContent = JSON.stringify({
        Tokens: { brand: { primary: color("#fff"), secondary: color("#f00") } },
      });
      const newGitContent = JSON.stringify({
        Tokens: { brand: { primary: color("#000"), secondary: color("#f00") } },
      });
      const figmaContent = JSON.stringify({
        Tokens: { brand: { primary: color("#fff"), secondary: color("#f00") } },
      });

      const getPullRequest = vi
        .fn()
        .mockResolvedValueOnce({ mergeable: null, mergeable_state: "unknown" })
        .mockResolvedValueOnce({ mergeable: true, mergeable_state: "clean" });
      const getFile = vi.fn().mockResolvedValue({ content: newGitContent, sha: "pr-sha" });
      const github = createMockGitHub({ getPullRequest, getFile });

      vi.mocked(requestImport).mockResolvedValue({ success: true, message: "Imported.", quarantined: [] });
      vi.mocked(requestExport).mockResolvedValueOnce(figmaContent).mockResolvedValueOnce(newGitContent);

      const promise = updateProposalBranch(settings, github, activeProposal, {
        diffs: [],
        figmaContent,
        gitContent: oldGitContent,
        proposals: [],
        collisionNotice: null,
        primaryModeName: "Default",
      });
      await vi.advanceTimersByTimeAsync(MERGE_POLL_INTERVAL_MS);
      const result = await promise;

      expect(github.updateBranch).toHaveBeenCalledWith(settings.owner, settings.repo, 5);
      expect(getFile).toHaveBeenCalledWith(expect.objectContaining({ branch: "figma/proposal-1" }));
      expect(result).toEqual(
        expect.objectContaining({ status: "updated", count: 1, gitContent: newGitContent })
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns a conflict status without touching Figma when mergeable_state is dirty", async () => {
    const getPullRequest = vi.fn().mockResolvedValue({ mergeable: false, mergeable_state: "dirty" });
    const github = createMockGitHub({ getPullRequest });

    const result = await updateProposalBranch(settings, github, activeProposal, {
      diffs: [],
      figmaContent: "{}",
      gitContent: "{}",
      proposals: [],
      collisionNotice: null,
      primaryModeName: "Default",
    });

    expect(result).toEqual({ status: "conflict", detail: expect.any(String) });
    expect(github.getFile).not.toHaveBeenCalled();
    expect(requestImport).not.toHaveBeenCalled();
  });

  it("returns a conflict status when update-branch itself rejects synchronously with a 422", async () => {
    const conflictError = Object.assign(new Error("Merge conflict between base and head"), { status: 422 });
    const updateBranch = vi.fn().mockRejectedValue(conflictError);
    const getPullRequest = vi.fn();
    const github = createMockGitHub({ updateBranch, getPullRequest });

    const result = await updateProposalBranch(settings, github, activeProposal, {
      diffs: [],
      figmaContent: "{}",
      gitContent: "{}",
      proposals: [],
      collisionNotice: null,
      primaryModeName: "Default",
    });

    expect(result).toEqual({ status: "conflict", detail: "Merge conflict between base and head" });
    expect(getPullRequest).not.toHaveBeenCalled();
  });

  it("rethrows a non-422 error from update-branch instead of treating it as a conflict", async () => {
    const authError = Object.assign(new Error("Bad credentials"), { status: 401 });
    const updateBranch = vi.fn().mockRejectedValue(authError);
    const github = createMockGitHub({ updateBranch });

    await expect(
      updateProposalBranch(settings, github, activeProposal, {
        diffs: [],
        figmaContent: "{}",
        gitContent: "{}",
        proposals: [],
        collisionNotice: null,
        primaryModeName: "Default",
      })
    ).rejects.toThrow("Bad credentials");
  });

  it("gives up and throws when mergeable_state never settles", async () => {
    vi.useFakeTimers();
    try {
      const getPullRequest = vi.fn().mockResolvedValue({ mergeable: null, mergeable_state: "unknown" });
      const github = createMockGitHub({ getPullRequest });

      const promise = updateProposalBranch(settings, github, activeProposal, {
        diffs: [],
        figmaContent: "{}",
        gitContent: "{}",
        proposals: [],
        collisionNotice: null,
        primaryModeName: "Default",
      });
      const assertion = expect(promise).rejects.toThrow(/finalizing this merge/);
      await vi.advanceTimersByTimeAsync(MERGE_POLL_INTERVAL_MS * 8);
      await assertion;

      expect(getPullRequest).toHaveBeenCalledTimes(8);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("abandonProposal", () => {
  beforeEach(() => {
    vi.mocked(requestExport).mockReset();
    vi.mocked(requestImport).mockReset();
  });

  const activeProposal = { number: 5, title: "x", html_url: "u", head_ref: "figma/proposal-1" };

  it("closes the PR, deletes its branch, then falls back to main via resolveDeadProposal", async () => {
    const oldGitContent = JSON.stringify({ Tokens: { brand: { primary: color("#fff") } } });
    const mainContent = JSON.stringify({ Tokens: { brand: { primary: color("#000") } } });
    const github = createMockGitHub({ getFile: vi.fn().mockResolvedValue({ content: mainContent, sha: "main-sha" }) });
    vi.mocked(requestImport).mockResolvedValue({ success: true, message: "Imported.", quarantined: [] });
    vi.mocked(requestExport).mockResolvedValueOnce(oldGitContent).mockResolvedValueOnce(mainContent);

    const result = await abandonProposal(settings, github, activeProposal, {
      diffs: [],
      figmaContent: oldGitContent,
      gitContent: oldGitContent,
      proposals: [],
      collisionNotice: null,
      primaryModeName: "Default",
    });

    expect(github.closePullRequest).toHaveBeenCalledWith(settings.owner, settings.repo, 5);
    expect(github.deleteBranch).toHaveBeenCalledWith(settings.owner, settings.repo, "figma/proposal-1");
    expect(result.gitContent).toBe(mainContent);
    expect(result.count).toBe(1);
  });
});

describe("checkProposalStaleness", () => {
  const activeProposal = { number: 5, title: "x", html_url: "u", head_ref: "figma/proposal-1" };

  function mockGithubWithMergeBase(mergeBaseContent: string, mainContent: string) {
    return createMockGitHub({
      getMergeBaseSha: vi.fn().mockResolvedValue("merge-base-sha"),
      getFile: vi.fn().mockImplementation((cfg: { branch: string }) =>
        cfg.branch === "merge-base-sha"
          ? Promise.resolve({ content: mergeBaseContent, sha: "merge-base-file-sha" })
          : Promise.resolve({ content: mainContent, sha: "main-sha" })
      ),
    });
  }

  it("returns a count when main has moved since the branch's fork point", async () => {
    const mergeBaseContent = JSON.stringify({ Tokens: { brand: { primary: color("#fff") } } });
    const mainContent = JSON.stringify({ Tokens: { brand: { primary: color("#000") } } });
    const github = mockGithubWithMergeBase(mergeBaseContent, mainContent);

    const result = await checkProposalStaleness(settings, github, activeProposal);

    expect(result).toEqual({ count: 1 });
    expect(github.getMergeBaseSha).toHaveBeenCalledWith(settings.owner, settings.repo, "figma/proposal-1", settings.branch);
  });

  it("returns null when main hasn't moved since the fork point, regardless of the branch's own proposed change", async () => {
    const forkPointContent = JSON.stringify({ Tokens: { brand: { primary: color("#fff") } } });
    const github = mockGithubWithMergeBase(forkPointContent, forkPointContent);

    const result = await checkProposalStaleness(settings, github, activeProposal);

    expect(result).toBeNull();
  });

  it("returns null when the raw strings differ (formatting only) but the parsed token values are identical", async () => {
    const mergeBaseContent = JSON.stringify({ Tokens: { brand: { primary: color("#fff") } } });
    const mainContent = JSON.stringify({ Tokens: { brand: { primary: color("#fff") } } }, null, 2);
    const github = mockGithubWithMergeBase(mergeBaseContent, mainContent);

    const result = await checkProposalStaleness(settings, github, activeProposal);

    expect(result).toBeNull();
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

    const { result, resolvedDeadProposal, staleness } = await checkActiveProposalStatus(settings, github, null, null);

    expect(github.listPullRequests).toHaveBeenCalledTimes(1);
    expect(github.getFile).toHaveBeenCalledTimes(1);
    expect(resolvedDeadProposal).toBeNull();
    expect(staleness).toBeNull();
    expect(result.diffs).toEqual([]);
  });

  it("does an ordinary check with no resolution and no staleness when the active proposal is still open and up to date", async () => {
    const github = createMockGitHub({
      listPullRequests: vi.fn().mockResolvedValue([{ number: 5, title: "x", state: "open", html_url: "u", head_ref: "figma/proposal-1" }]),
    });
    vi.mocked(requestExport).mockResolvedValue("{}");

    const { resolvedDeadProposal, staleness } = await checkActiveProposalStatus(settings, github, activeProposal, null);

    expect(resolvedDeadProposal).toBeNull();
    expect(staleness).toBeNull();
    expect(github.listPullRequests).toHaveBeenCalledTimes(1);
  });

  it("surfaces staleness when the active proposal is open and main moved since the fork point", async () => {
    const forkPointContent = JSON.stringify({ Tokens: { brand: { primary: color("#fff") } } });
    const mainContent = JSON.stringify({ Tokens: { brand: { primary: color("#000") } } });
    const branchContent = JSON.stringify({
      Tokens: { brand: { primary: color("#fff"), secondary: color("#123456") } },
    });
    const getFile = vi.fn().mockImplementation((cfg: { branch: string }) => {
      if (cfg.branch === "figma/proposal-1") return Promise.resolve({ content: branchContent, sha: "pr-sha" });
      if (cfg.branch === "merge-base-sha") return Promise.resolve({ content: forkPointContent, sha: "merge-base-file-sha" });
      return Promise.resolve({ content: mainContent, sha: "main-sha" });
    });
    const github = createMockGitHub({
      listPullRequests: vi.fn().mockResolvedValue([{ number: 5, title: "x", state: "open", html_url: "u", head_ref: "figma/proposal-1" }]),
      getMergeBaseSha: vi.fn().mockResolvedValue("merge-base-sha"),
      getFile,
    });
    vi.mocked(requestExport).mockResolvedValue(branchContent);

    const { resolvedDeadProposal, staleness } = await checkActiveProposalStatus(settings, github, activeProposal, null);

    expect(resolvedDeadProposal).toBeNull();
    expect(staleness).toEqual({ count: 1 });
  });

  it("does not surface staleness for the branch's own proposed change when main hasn't moved since the fork point", async () => {
    const forkPointContent = JSON.stringify({ Tokens: { brand: { primary: color("#fff") } } });
    const branchContent = JSON.stringify({
      Tokens: { brand: { primary: color("#fff"), secondary: color("#123456") } },
    });
    const getFile = vi.fn().mockImplementation((cfg: { branch: string }) => {
      if (cfg.branch === "figma/proposal-1") return Promise.resolve({ content: branchContent, sha: "pr-sha" });
      return Promise.resolve({ content: forkPointContent, sha: "main-sha" });
    });
    const github = createMockGitHub({
      listPullRequests: vi.fn().mockResolvedValue([{ number: 5, title: "x", state: "open", html_url: "u", head_ref: "figma/proposal-1" }]),
      getMergeBaseSha: vi.fn().mockResolvedValue("merge-base-sha"),
      getFile,
    });
    vi.mocked(requestExport).mockResolvedValue(branchContent);

    const { staleness } = await checkActiveProposalStatus(settings, github, activeProposal, null);

    expect(staleness).toBeNull();
  });

  it("auto-syncs Figma when main's content moved since the last check, with no switch involved", async () => {
    const oldGitContent = JSON.stringify({
      Tokens: { brand: { primary: color("#fff"), secondary: color("#f00") } },
    });
    const newGitContent = JSON.stringify({
      Tokens: { brand: { primary: color("#000"), secondary: color("#f00") } },
    });
    const github = createMockGitHub({ getFile: vi.fn().mockResolvedValue({ content: newGitContent, sha: "main-sha" }) });
    vi.mocked(requestImport).mockResolvedValue({ success: true, message: "Imported.", quarantined: [] });
    // Three requestExport calls in this order: checkForProposalChanges's own diff, the safe-apply
    // merge step, and the final post-import re-diff — Figma's live content is unchanged (== oldGitContent)
    // until the merge writes to it, then the last call reflects the merged result.
    vi.mocked(requestExport).mockResolvedValueOnce(oldGitContent).mockResolvedValueOnce(oldGitContent).mockResolvedValueOnce(newGitContent);

    const { result, syncedCount } = await checkActiveProposalStatus(settings, github, null, {
      diffs: [],
      figmaContent: oldGitContent,
      gitContent: oldGitContent,
      proposals: [],
      collisionNotice: null,
      primaryModeName: "Default",
    });

    expect(syncedCount).toBe(1);
    expect(JSON.parse(vi.mocked(requestImport).mock.calls[0][0])).toEqual({
      Tokens: { brand: { primary: color("#000"), secondary: color("#f00") } },
    });
    expect(result.gitContent).toBe(newGitContent);
  });

  it("excludes a locally drifted path from the idle-drift auto-apply", async () => {
    const oldGitContent = JSON.stringify({
      Tokens: { brand: { primary: color("#fff"), secondary: color("#f00") } },
    });
    const newGitContent = JSON.stringify({
      Tokens: { brand: { primary: color("#000"), secondary: color("#0ff") } },
    });
    const liveFigmaContent = JSON.stringify({
      Tokens: { brand: { primary: color("#fff"), secondary: color("#123456") } },
    });
    const github = createMockGitHub({ getFile: vi.fn().mockResolvedValue({ content: newGitContent, sha: "main-sha" }) });
    vi.mocked(requestImport).mockResolvedValue({ success: true, message: "Imported.", quarantined: [] });
    const mergedFigmaContent = JSON.stringify({
      Tokens: { brand: { primary: color("#000"), secondary: color("#123456") } },
    });
    vi.mocked(requestExport)
      .mockResolvedValueOnce(liveFigmaContent)
      .mockResolvedValueOnce(liveFigmaContent)
      .mockResolvedValueOnce(mergedFigmaContent);

    const { syncedCount } = await checkActiveProposalStatus(settings, github, null, {
      diffs: [
        {
          path: ["Tokens", "brand", "secondary"],
          dotPath: "Tokens.brand.secondary",
          type: "modified" as const,
          figmaVal: "#123456",
          gitVal: "#f00",
        },
      ],
      figmaContent: oldGitContent,
      gitContent: oldGitContent,
      proposals: [],
      collisionNotice: null,
      primaryModeName: "Default",
    });

    expect(syncedCount).toBe(1);
    expect(JSON.parse(vi.mocked(requestImport).mock.calls[0][0])).toEqual({
      Tokens: { brand: { primary: color("#000"), secondary: color("#123456") } },
    });
  });

  it("does not auto-sync on the very first check, with nothing to compare against", async () => {
    const github = createMockGitHub();
    vi.mocked(requestExport).mockResolvedValue("{}");

    const { syncedCount } = await checkActiveProposalStatus(settings, github, null, null);

    expect(syncedCount).toBe(0);
    expect(requestImport).not.toHaveBeenCalled();
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
