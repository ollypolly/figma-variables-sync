import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@create-figma-plugin/utilities", () => ({ on: vi.fn(() => vi.fn()), emit: vi.fn() }));
vi.mock("@services/figmaMessages", () => ({ requestExport: vi.fn(), requestImport: vi.fn() }));

import { $activeProposal } from "./activeProposalStore";
import { $background, $check, $conflictNotice, $dismissedStalenessCount, $staleness } from "./proposalsStore";
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
