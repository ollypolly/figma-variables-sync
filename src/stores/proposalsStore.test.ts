import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@create-figma-plugin/utilities", () => ({ on: vi.fn(() => vi.fn()), emit: vi.fn() }));
vi.mock("@services/figmaMessages", () => ({ requestExport: vi.fn(), requestImport: vi.fn() }));

const mockGithub = vi.hoisted(() => ({
  getFile: vi.fn(),
  listPullRequests: vi.fn(),
  getPullRequest: vi.fn(),
  getMergeBaseSha: vi.fn(),
  updateBranch: vi.fn(),
  closePullRequest: vi.fn(),
  deleteBranch: vi.fn(),
  createBranch: vi.fn(),
  updateFile: vi.fn(),
  createPullRequest: vi.fn(),
}));

vi.mock("@services/github", () => ({
  GitHubService: vi.fn().mockImplementation(function () {
    return mockGithub;
  }),
  PROPOSAL_BRANCH_PREFIX: "figma/proposal-",
}));

import { requestExport, requestImport } from "@services/figmaMessages";
import { $activeProposal } from "./activeProposalStore";
import {
  $background,
  $check,
  $connectionError,
  $conflictNotice,
  $dismissedStalenessCount,
  $pendingSync,
  $staleness,
  $status,
  $switchLoading,
  cancelPendingSync,
  initProposalsSync,
  requestSwitch,
  setDescription,
  submitProposal,
} from "./proposalsStore";
import { updateSettings } from "./settingsStore";
import type { ProposalCheckResult } from "@services/proposals";
import type { ActiveProposal } from "../types";

const staleResult: ProposalCheckResult = {
  diffs: [],
  figmaContent: "{}",
  gitContent: "{}",
  proposals: [],
  collisionNotice: null,
  resetNotice: null,
  primaryModeName: "Default",
};

const staleActiveProposal: ActiveProposal = {
  number: 1,
  title: "x",
  html_url: "u",
  head_ref: "figma/proposal-1",
};

function seedStaleState() {
  $check.set(staleResult);
  $activeProposal.set(staleActiveProposal);
  $staleness.set({ count: 3 });
  $dismissedStalenessCount.set(3);
  $conflictNotice.set({ number: 1, head_ref: "x", html_url: "u", detail: "d", fixInstructions: "f" });
  $background.set({ success: true, text: "stale message" });
}

describe("proposalsStore — settings identity invalidation", () => {
  beforeEach(() => {
    updateSettings({
      pat: "test-pat",
      owner: "owner",
      repo: "repo",
      filePath: "tokens.json",
      branch: "main",
      prLabels: "",
      skipSwitchConfirmation: false,
    });
  });

  it("clears the stale check/proposal/staleness baseline when the owner changes", () => {
    seedStaleState();
    updateSettings((s) => ({ ...s, owner: "different-owner" }));

    expect($check.get()).toBeNull();
    expect($activeProposal.get()).toBeNull();
    expect($staleness.get()).toBeNull();
    expect($dismissedStalenessCount.get()).toBe(0);
    expect($conflictNotice.get()).toBeNull();
    expect($background.get()).toBeNull();
  });

  it("clears the stale baseline when the branch changes, even though owner/repo/filePath stay the same", () => {
    seedStaleState();
    updateSettings((s) => ({ ...s, branch: "figma/proposal-2" }));

    expect($check.get()).toBeNull();
    expect($activeProposal.get()).toBeNull();
  });

  it("clears the stale baseline when the filePath changes", () => {
    seedStaleState();
    updateSettings((s) => ({ ...s, filePath: "other-tokens.json" }));

    expect($check.get()).toBeNull();
    expect($activeProposal.get()).toBeNull();
  });

  it("leaves the check/proposal baseline untouched when only the PAT changes", () => {
    seedStaleState();
    updateSettings((s) => ({ ...s, pat: "a-new-pat" }));

    expect($check.get()).toEqual(staleResult);
    expect($activeProposal.get()).toEqual(staleActiveProposal);
  });

  it("leaves the check/proposal baseline untouched when only skipSwitchConfirmation changes", () => {
    seedStaleState();
    updateSettings((s) => ({ ...s, skipSwitchConfirmation: true }));

    expect($check.get()).toEqual(staleResult);
    expect($activeProposal.get()).toEqual(staleActiveProposal);
  });

  it("leaves the check/proposal baseline untouched on a no-op update that doesn't change identity fields", () => {
    seedStaleState();
    updateSettings((s) => ({ ...s }));

    expect($check.get()).toEqual(staleResult);
    expect($activeProposal.get()).toEqual(staleActiveProposal);
  });
});

describe("proposalsStore — sync confirm gating", () => {
  const oldGitContent = JSON.stringify({ Tokens: { brand: { primary: { $type: "color", $value: "#fff" } } } });
  const newGitContent = JSON.stringify({ Tokens: { brand: { primary: { $type: "color", $value: "#000" } } } });

  beforeEach(() => {
    vi.mocked(requestExport).mockReset();
    vi.mocked(requestImport).mockReset();
    mockGithub.getFile.mockReset();
    mockGithub.listPullRequests.mockReset();
    $pendingSync.set(null);
    $switchLoading.set(false);
    $check.set({
      diffs: [],
      figmaContent: oldGitContent,
      gitContent: oldGitContent,
      proposals: [],
      collisionNotice: null,
      resetNotice: null,
      primaryModeName: "Default",
    });
  });

  it("holds a non-empty safe sync for confirmation instead of applying it, when skipSwitchConfirmation is off", async () => {
    updateSettings({
      pat: "test-pat",
      owner: "owner",
      repo: "repo",
      filePath: "tokens.json",
      branch: "main",
      prLabels: "",
      skipSwitchConfirmation: false,
    });
    mockGithub.getFile.mockResolvedValue({ content: newGitContent, sha: "main-sha" });
    vi.mocked(requestExport).mockResolvedValue(oldGitContent);

    await requestSwitch(null);

    expect(requestImport).not.toHaveBeenCalled();
    expect($pendingSync.get()).toEqual(
      expect.objectContaining({ targetLabel: "main", count: 1, commit: expect.any(Function) })
    );
  });

  it("applies the held sync once its commit() is invoked, clearing $pendingSync afterward", async () => {
    updateSettings({
      pat: "test-pat",
      owner: "owner",
      repo: "repo",
      filePath: "tokens.json",
      branch: "main",
      prLabels: "",
      skipSwitchConfirmation: false,
    });
    mockGithub.getFile.mockResolvedValue({ content: newGitContent, sha: "main-sha" });
    vi.mocked(requestExport).mockResolvedValue(oldGitContent);
    vi.mocked(requestImport).mockResolvedValue({ success: true, message: "Imported.", quarantined: [] });

    await requestSwitch(null);
    await $pendingSync.get()?.commit();

    expect(requestImport).toHaveBeenCalledTimes(1);
    expect($pendingSync.get()).toBeNull();
  });

  it("cancelPendingSync clears the held sync without applying it", async () => {
    updateSettings({
      pat: "test-pat",
      owner: "owner",
      repo: "repo",
      filePath: "tokens.json",
      branch: "main",
      prLabels: "",
      skipSwitchConfirmation: false,
    });
    mockGithub.getFile.mockResolvedValue({ content: newGitContent, sha: "main-sha" });
    vi.mocked(requestExport).mockResolvedValue(oldGitContent);

    await requestSwitch(null);
    cancelPendingSync();

    expect($pendingSync.get()).toBeNull();
    expect(requestImport).not.toHaveBeenCalled();
  });

  it("auto-applies without a dialog when skipSwitchConfirmation is on, even with a non-empty safe subset", async () => {
    updateSettings({
      pat: "test-pat",
      owner: "owner",
      repo: "repo",
      filePath: "tokens.json",
      branch: "main",
      prLabels: "",
      skipSwitchConfirmation: true,
    });
    mockGithub.getFile.mockResolvedValue({ content: newGitContent, sha: "main-sha" });
    vi.mocked(requestExport).mockResolvedValue(oldGitContent);
    vi.mocked(requestImport).mockResolvedValue({ success: true, message: "Imported.", quarantined: [] });

    await requestSwitch(null);

    expect(requestImport).toHaveBeenCalledTimes(1);
    expect($pendingSync.get()).toBeNull();
  });

  it("auto-applies without a dialog when there is nothing to sync, even with skipSwitchConfirmation off", async () => {
    updateSettings({
      pat: "test-pat",
      owner: "owner",
      repo: "repo",
      filePath: "tokens.json",
      branch: "main",
      prLabels: "",
      skipSwitchConfirmation: false,
    });
    mockGithub.getFile.mockResolvedValue({ content: oldGitContent, sha: "main-sha" });
    vi.mocked(requestExport).mockResolvedValue(oldGitContent);

    await requestSwitch(null);

    expect(requestImport).not.toHaveBeenCalled();
    expect($pendingSync.get()).toBeNull();
  });
});

describe("proposalsStore — connection error surfacing and fallback", () => {
  const gitContent = JSON.stringify({ Tokens: { brand: { primary: { $type: "color", $value: "#fff" } } } });
  const forbidden = Object.assign(new Error("Resource not accessible by personal access token"), { status: 403 });

  async function flushMicrotasks(times = 20) {
    for (let i = 0; i < times; i++) await Promise.resolve();
  }

  beforeEach(() => {
    vi.mocked(requestExport).mockReset();
    vi.mocked(requestImport).mockReset();
    mockGithub.getFile.mockReset();
    mockGithub.listPullRequests.mockReset();
    $check.set(null);
    $pendingSync.set(null);
    $connectionError.set(null);
    updateSettings({
      pat: "test-pat",
      owner: "owner",
      repo: "repo",
      filePath: "tokens.json",
      branch: "main",
      prLabels: "",
      skipSwitchConfirmation: false,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("surfaces a background poll failure via $status instead of swallowing it", async () => {
    vi.useFakeTimers();
    try {
      mockGithub.getFile.mockResolvedValue({ content: gitContent, sha: "sha" });
      mockGithub.listPullRequests.mockResolvedValue([]);
      vi.mocked(requestExport).mockResolvedValue(gitContent);

      const stop = initProposalsSync();
      await flushMicrotasks();
      expect($check.get()).not.toBeNull();

      mockGithub.listPullRequests.mockRejectedValue(forbidden);

      await vi.advanceTimersByTimeAsync(30_000);
      await flushMicrotasks();

      expect($connectionError.get()).toContain("403");
      expect($status.get()).toEqual({ success: false, text: $connectionError.get() });

      stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps a connection error visible across fast-poll ticks, since those never touch GitHub", async () => {
    vi.useFakeTimers();
    try {
      mockGithub.getFile.mockResolvedValue({ content: gitContent, sha: "sha" });
      mockGithub.listPullRequests.mockResolvedValue([]);
      vi.mocked(requestExport).mockResolvedValue(gitContent);

      const stop = initProposalsSync();
      await flushMicrotasks();

      mockGithub.listPullRequests.mockRejectedValue(forbidden);
      await vi.advanceTimersByTimeAsync(30_000);
      await flushMicrotasks();
      expect($connectionError.get()).toContain("403");

      await vi.advanceTimersByTimeAsync(3_000);
      await flushMicrotasks();
      expect($connectionError.get()).toContain("403");

      stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it("doesn't mislabel a non-GitHub fast-poll failure as a GitHub connection issue", async () => {
    vi.useFakeTimers();
    try {
      mockGithub.getFile.mockResolvedValue({ content: gitContent, sha: "sha" });
      mockGithub.listPullRequests.mockResolvedValue([]);
      vi.mocked(requestExport).mockResolvedValue(gitContent);

      const stop = initProposalsSync();
      await flushMicrotasks();

      vi.mocked(requestExport).mockRejectedValue(new Error("Figma export failed: unsupported variable type."));

      await vi.advanceTimersByTimeAsync(3_000);
      await flushMicrotasks();

      expect($connectionError.get()).toBe("Figma export failed: unsupported variable type.");

      stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it("clears a connection error once a later poll succeeds, with nothing to fall back to on the first failure", async () => {
    vi.useFakeTimers();
    try {
      mockGithub.getFile.mockRejectedValue(forbidden);
      mockGithub.listPullRequests.mockRejectedValue(forbidden);
      vi.mocked(requestExport).mockResolvedValue(gitContent);

      const stop = initProposalsSync();
      await flushMicrotasks();
      expect($connectionError.get()).toContain("403");
      expect($check.get()).toBeNull();

      mockGithub.getFile.mockResolvedValue({ content: gitContent, sha: "sha" });
      mockGithub.listPullRequests.mockResolvedValue([]);

      await vi.advanceTimersByTimeAsync(30_000);
      await flushMicrotasks();

      expect($connectionError.get()).toBeNull();
      expect($check.get()).not.toBeNull();

      stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it("hides previously shown local changes once GitHub can no longer confirm the baseline", async () => {
    vi.useFakeTimers();
    try {
      const localFigmaContent = JSON.stringify({ Tokens: { brand: { primary: { $type: "color", $value: "#000" } } } });
      mockGithub.getFile.mockResolvedValue({ content: gitContent, sha: "sha" });
      mockGithub.listPullRequests.mockResolvedValue([]);
      vi.mocked(requestExport).mockResolvedValue(localFigmaContent);

      const stop = initProposalsSync();
      await flushMicrotasks();
      expect($check.get()?.diffs).toHaveLength(1);
      expect($connectionError.get()).toBeNull();

      mockGithub.listPullRequests.mockRejectedValue(forbidden);

      await vi.advanceTimersByTimeAsync(30_000);
      await flushMicrotasks();

      expect($check.get()).toBeNull();
      expect($connectionError.get()).toContain("403");
      expect($connectionError.get()).toContain("Local changes are hidden");

      stop();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("proposalsStore — stale read after our own write", () => {
  beforeEach(() => {
    vi.mocked(requestExport).mockReset();
    mockGithub.getFile.mockReset();
    mockGithub.listPullRequests.mockReset();
    mockGithub.getPullRequest.mockReset();
    mockGithub.createBranch.mockReset();
    mockGithub.updateFile.mockReset();
    mockGithub.createPullRequest.mockReset();
    $check.set(null);
    $activeProposal.set(null);
    $pendingSync.set(null);
    $connectionError.set(null);
    updateSettings({
      pat: "test-pat",
      owner: "owner",
      repo: "repo",
      filePath: "tokens.json",
      branch: "main",
      prLabels: "",
      skipSwitchConfirmation: false,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function flushMicrotasks(times = 20) {
    for (let i = 0; i < times; i++) await Promise.resolve();
  }

  it("doesn't sync a designer's fresh submit back to the old value when a poll still reports the pre-write sha", async () => {
    vi.useFakeTimers();
    try {
      const oldGitContent = JSON.stringify({ Tokens: { brand: { primary: { $type: "color", $value: "#fff" } } } });
      const newFigmaContent = JSON.stringify({ Tokens: { brand: { primary: { $type: "color", $value: "#000" } } } });

      mockGithub.getFile.mockResolvedValue({ content: oldGitContent, sha: "old-sha" });
      mockGithub.listPullRequests.mockResolvedValue([]);
      vi.mocked(requestExport).mockResolvedValue(newFigmaContent);

      const stop = initProposalsSync();
      await flushMicrotasks();
      expect($check.get()?.diffs).toHaveLength(1);

      mockGithub.createBranch.mockResolvedValue(undefined);
      mockGithub.updateFile.mockResolvedValue("new-sha");
      mockGithub.createPullRequest.mockResolvedValue({ number: 1, html_url: "https://github.com/pull/1" });
      mockGithub.getPullRequest.mockResolvedValue({ state: "open", mergeable: true, mergeable_state: "clean" });

      setDescription("Update brand primary");
      await submitProposal();

      const freshGitContent = $check.get()?.gitContent;
      expect(freshGitContent).not.toBe(oldGitContent);
      expect($check.get()?.diffs).toEqual([]);

      // GitHub's Contents API hasn't caught up yet — the next poll still reads the pre-write content/sha.
      mockGithub.getFile.mockResolvedValue({ content: oldGitContent, sha: "old-sha" });

      await vi.advanceTimersByTimeAsync(30_000);
      await flushMicrotasks();

      expect($check.get()?.gitContent).toBe(freshGitContent);
      expect($pendingSync.get()).toBeNull();

      // GitHub catches up — the read now matches what we wrote, so normal drift-checking resumes.
      mockGithub.getFile.mockResolvedValue({ content: freshGitContent, sha: "new-sha" });

      await vi.advanceTimersByTimeAsync(30_000);
      await flushMicrotasks();

      expect($check.get()?.gitContent).toBe(freshGitContent);

      stop();
    } finally {
      vi.useRealTimers();
    }
  });
});
