import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@services/figmaMessages", () => ({ requestExport: vi.fn(), requestImport: vi.fn() }));

import { requestExport, requestImport } from "@services/figmaMessages";
import {
  applySafeSubset,
  checkFigmaChanges,
  computeSafeSubset,
  resetFigmaToGit,
  resolveDiffSettings,
} from "./gitSync";
import { NamingCollisionError } from "@common/dtcg";
import { color } from "@common/testUtils/tokens";
import type { PluginSettings } from "../types";

const settings: PluginSettings = {
  pat: "test-pat",
  owner: "owner",
  repo: "repo",
  filePath: "tokens.json",
  branch: "main",
  prLabels: "",
  skipSwitchConfirmation: false,
};

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

  it("surfaces a non-blocking reset notice for a dangling alias, without dropping other real diffs", async () => {
    const gitTokens = JSON.stringify({
      Tokens: {
        brand: {
          primary: { $type: "color", $value: "#fff" },
          warning: { $type: "color", $value: "{Semantic.Colours.Status.Warning}" },
        },
      },
    });
    const figmaTokens = JSON.stringify({
      Tokens: {
        brand: {
          primary: { $type: "color", $value: "#000" },
          warning: { $type: "color", $value: "{Semantic.Colours.Status.Warning}" },
        },
      },
    });
    vi.mocked(requestExport).mockResolvedValue(figmaTokens);

    const result = await checkFigmaChanges(gitTokens, settings);

    expect(result.collisionNotice).toBeNull();
    expect(result.resetNotice).toEqual({
      message: "1 token had a value that couldn't be resolved and was reset to a default color.",
      paths: ["Tokens.brand.warning"],
    });
    expect(result.diffs).toHaveLength(1);
    expect(result.diffs[0].dotPath).toBe("Tokens.brand.primary");
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

describe("resetFigmaToGit", () => {
  beforeEach(() => {
    vi.mocked(requestExport).mockReset();
    vi.mocked(requestImport).mockReset();
  });

  it("imports gitContent into Figma, then re-diffs to confirm the result", async () => {
    const gitTokens = JSON.stringify({ Tokens: { brand: { primary: { $type: "color", $value: "#fff" } } } });
    vi.mocked(requestImport).mockResolvedValue({ success: true, message: "Imported.", quarantined: [] });
    vi.mocked(requestExport).mockResolvedValue(gitTokens);

    const result = await resetFigmaToGit(gitTokens, settings);

    expect(requestImport).toHaveBeenCalledWith(gitTokens);
    expect(result.diffs).toEqual([]);
  });

  it("throws instead of re-diffing when the import itself fails", async () => {
    vi.mocked(requestImport).mockResolvedValue({ success: false, message: "Import failed.", quarantined: [] });

    await expect(resetFigmaToGit("{}", settings)).rejects.toThrow("Import failed.");
    expect(requestExport).not.toHaveBeenCalled();
  });
});

describe("computeSafeSubset", () => {
  beforeEach(() => {
    vi.mocked(requestExport).mockReset();
  });

  it("excludes a path that's unchanged between the old and new git target", async () => {
    const oldGit = JSON.stringify({ Tokens: { brand: { primary: color("#fff") } } });
    const newGit = JSON.stringify({ Tokens: { brand: { primary: color("#fff") } } });
    vi.mocked(requestExport).mockResolvedValue(oldGit);

    expect(await computeSafeSubset(oldGit, newGit)).toEqual(new Set());
  });

  it("includes a path that changed on the new target with no local Figma drift", async () => {
    const oldGit = JSON.stringify({ Tokens: { brand: { primary: color("#fff") } } });
    const newGit = JSON.stringify({ Tokens: { brand: { primary: color("#000") } } });
    vi.mocked(requestExport).mockResolvedValue(oldGit);

    expect(await computeSafeSubset(oldGit, newGit)).toEqual(new Set(["Tokens.brand.primary"]));
  });

  it("excludes a path that changed on the new target if the designer already has a local edit there", async () => {
    const oldGit = JSON.stringify({ Tokens: { brand: { primary: color("#fff") } } });
    const newGit = JSON.stringify({ Tokens: { brand: { primary: color("#000") } } });
    const liveFigmaContent = JSON.stringify({ Tokens: { brand: { primary: color("#0f0") } } });
    vi.mocked(requestExport).mockResolvedValue(liveFigmaContent);

    expect(await computeSafeSubset(oldGit, newGit)).toEqual(new Set());
  });

  it("excludes a path deleted going from the old to the new git target, regardless of drift", async () => {
    const oldGit = JSON.stringify({ Tokens: { brand: { primary: color("#fff") } } });
    const newGit = JSON.stringify({ Tokens: { brand: {} } });
    vi.mocked(requestExport).mockResolvedValue(oldGit);

    expect(await computeSafeSubset(oldGit, newGit)).toEqual(new Set());
  });

  it("always fetches a fresh Figma export rather than trusting caller-supplied drift info", async () => {
    const oldGit = JSON.stringify({ Tokens: { brand: { primary: color("#fff"), secondary: color("#aaa") } } });
    const newGit = JSON.stringify({ Tokens: { brand: { primary: color("#000"), secondary: color("#bbb") } } });
    const figmaContentEditedJustNow = JSON.stringify({
      Tokens: { brand: { primary: color("#fff"), secondary: color("#ccc") } },
    });
    vi.mocked(requestExport).mockResolvedValue(figmaContentEditedJustNow);

    expect(await computeSafeSubset(oldGit, newGit)).toEqual(new Set(["Tokens.brand.primary"]));
  });
});

describe("applySafeSubset", () => {
  beforeEach(() => {
    vi.mocked(requestExport).mockReset();
    vi.mocked(requestImport).mockReset();
  });

  it("merges the safe subset onto Figma's current content and re-diffs against the new git target", async () => {
    const figmaContent = JSON.stringify({ Tokens: { brand: { primary: color("#fff") } } });
    const newGitContent = JSON.stringify({ Tokens: { brand: { primary: color("#000") } } });
    vi.mocked(requestImport).mockResolvedValue({ success: true, message: "Imported.", quarantined: [] });
    vi.mocked(requestExport).mockResolvedValueOnce(figmaContent).mockResolvedValueOnce(newGitContent);

    const result = await applySafeSubset(newGitContent, new Set(["Tokens.brand.primary"]), settings);

    expect(JSON.parse(vi.mocked(requestImport).mock.calls[0][0])).toEqual({
      Tokens: { brand: { primary: color("#000") } },
    });
    expect(result.diffs).toEqual([]);
  });

  it("throws instead of re-diffing when the import itself fails", async () => {
    vi.mocked(requestExport).mockResolvedValue("{}");
    vi.mocked(requestImport).mockResolvedValue({ success: false, message: "Import failed.", quarantined: [] });

    await expect(
      applySafeSubset("{}", new Set(["Tokens.brand.primary"]), settings)
    ).rejects.toThrow("Import failed.");
    expect(requestExport).toHaveBeenCalledTimes(1);
  });

  it("skips the import (and the fetch of current Figma content it needs) when there's nothing safe to apply", async () => {
    const newGitContent = JSON.stringify({ Tokens: { brand: { primary: color("#000") } } });
    vi.mocked(requestExport).mockResolvedValue(newGitContent);

    const result = await applySafeSubset(newGitContent, new Set(), settings);

    expect(requestImport).not.toHaveBeenCalled();
    expect(requestExport).toHaveBeenCalledTimes(1);
    expect(result.diffs).toEqual([]);
  });
});
