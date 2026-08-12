import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@services/figmaMessages", () => ({ requestExport: vi.fn(), requestImport: vi.fn() }));

import { requestExport, requestImport } from "@services/figmaMessages";
import { checkFigmaChanges, resetFigmaToGit, resolveDiffSettings } from "./gitSync";
import { NamingCollisionError } from "@common/dtcg";
import type { PluginSettings } from "../types";

const settings: PluginSettings = {
  pat: "test-pat",
  owner: "owner",
  repo: "repo",
  filePath: "tokens.json",
  branch: "main",
  prLabels: "",
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
