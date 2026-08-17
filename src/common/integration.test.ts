import { describe, it, expect, vi, beforeEach } from "vitest";
import { exportToDtcg } from "./dtcg/exporter/exportToDtcg";
import { importFromDtcg } from "./dtcg/importer/importFromDtcg";
import { computeDiff } from "./diff";
import { GitHubService } from "../services/github";
import { submitProposal } from "../services/proposals";
import { computeSafeSubset, applySafeSubset } from "../services/gitSync";
import { applyStagedDiffs } from "./applyStagedDiffs";
import { requestExport, requestImport } from "../services/figmaMessages";
import { trimSettings, PluginSettings } from "../types";
import { createMockFigma } from "@common/testUtils/mockFigma";

// Mock Octokit
const mockRequest = vi.fn();
vi.mock("@octokit/core", () => {
  return {
    Octokit: class {
      request = mockRequest;
    }
  };
});

// submitProposal's module also imports requestExport, which talks to the real Figma sandbox
// via @create-figma-plugin/utilities — unavailable outside a plugin runtime. Not exercised
// by these tests (figmaContent is passed in directly), so a stub is enough.
vi.mock("@services/figmaMessages", () => ({ requestExport: vi.fn(), requestImport: vi.fn() }));

// computeSafeSubset/applySafeSubset go through requestExport/requestImport rather than a
// figmaMock reference directly, so tests exercising them wire the mocked message functions
// back to a real figmaMock — the same round trip the plugin's own handlers perform.
function connectFigmaMessagesTo(figmaMock: any) {
  vi.mocked(requestExport).mockImplementation(async () =>
    exportToDtcg(figmaMock.variables.getLocalVariableCollections(), figmaMock.variables.getLocalVariables(), figmaMock)
  );
  vi.mocked(requestImport).mockImplementation(async (json: string) => {
    const { quarantined } = await importFromDtcg(json, figmaMock);
    return { success: true, message: "Variables imported successfully.", quarantined };
  });
}

describe("Plugin Flow Integration Tests", () => {
  let github: GitHubService;
  const config = {
    owner: "owner",
    repo: "repo",
    filePath: "tokens.json",
    branch: "main",
    prLabels: "",
    skipSwitchConfirmation: false,
  };

  beforeEach(() => {
    mockRequest.mockReset();
    github = new GitHubService("token");
  });

  describe("Updates Flow", () => {
    it("should fetch tokens, detect changes, and apply updates to Figma variables", async () => {
      // 1. Mock GitHub getFile returning token JSON
      const gitTokens = {
        Tokens: {
          brand: {
            primary: {
              $type: "color",
              $value: "#00ff00"
            }
          }
        }
      };
      mockRequest.mockResolvedValueOnce({
        data: {
          type: "file",
          content: btoa(JSON.stringify(gitTokens)),
          sha: "git-sha-123"
        }
      });

      // 2. Setup initial Figma state with a differing color
      const { figmaMock } = createMockFigma();
      const col = figmaMock.variables.createVariableCollection("Tokens");
      const primaryVar = figmaMock.variables.createVariable("brand/primary", col.id, "COLOR");
      primaryVar.setValueForMode(col.modes[0].modeId, { r: 1, g: 0, b: 0 }); // #ff0000

      // 3. Perform step: check for updates
      const fileData = await github.getFile(config);
      expect(fileData).not.toBeNull();
      const gitJson = fileData!.content;
      
      const figmaJson = exportToDtcg(
        figmaMock.variables.getLocalVariableCollections(),
        figmaMock.variables.getLocalVariables(),
        figmaMock
      );

      const { diffs } = computeDiff(figmaJson, gitJson, "updates");

      // Verify diff calculation: #ff0000 (figma) vs #00ff00 (git)
      expect(diffs).toHaveLength(1);
      expect(diffs[0]).toEqual({
        path: ["Tokens", "brand", "primary"],
        dotPath: "Tokens.brand.primary",
        type: "modified",
        figmaVal: "#ff0000",
        gitVal: "#00ff00"
      });

      // 4. Perform step: apply updates (import gitJson back to Figma)
      await importFromDtcg(gitJson, figmaMock);

      // Verify that Figma variable has been updated to git value #00ff00
      expect(primaryVar.valuesByMode[col.modes[0].modeId]).toEqual({ r: 0, g: 1, b: 0, a: 1 });
    });
  });

  describe("Proposals Flow", () => {
    it("should export variables, detect outgoing changes, create branch, commit, and open PR", async () => {
      // 1. Mock GitHub getFile returning older token JSON (or empty/null for new)
      const gitTokens = {
        Tokens: {
          brand: {
            primary: {
              $type: "color",
              $value: "#ffffff"
            }
          }
        }
      };
      mockRequest.mockResolvedValueOnce({
        data: {
          type: "file",
          content: btoa(JSON.stringify(gitTokens)),
          sha: "base-sha"
        }
      });

      // 2. Setup current Figma state with an added and a modified variable
      const { figmaMock } = createMockFigma();
      const col = figmaMock.variables.createVariableCollection("Tokens");
      const primaryVar = figmaMock.variables.createVariable("brand/primary", col.id, "COLOR");
      primaryVar.setValueForMode(col.modes[0].modeId, { r: 0, g: 0, b: 0 }); // modified to #000000

      const secondaryVar = figmaMock.variables.createVariable("brand/secondary", col.id, "COLOR");
      secondaryVar.setValueForMode(col.modes[0].modeId, { r: 1, g: 0, b: 0 }); // added #ff0000

      // 3. Check for proposals
      const fileData = await github.getFile(config);
      const gitJson = fileData?.content ?? "{}";

      const figmaJson = exportToDtcg(
        figmaMock.variables.getLocalVariableCollections(),
        figmaMock.variables.getLocalVariables(),
        figmaMock
      );

      const { diffs } = computeDiff(figmaJson, gitJson, "proposals");

      // Verify diff detection
      expect(diffs).toHaveLength(2);
      const primaryDiff = diffs.find(d => d.dotPath === "Tokens.brand.primary");
      const secondaryDiff = diffs.find(d => d.dotPath === "Tokens.brand.secondary");
      expect(primaryDiff).toEqual({
        path: ["Tokens", "brand", "primary"],
        dotPath: "Tokens.brand.primary",
        type: "modified",
        figmaVal: "#000000",
        gitVal: "#ffffff"
      });
      expect(secondaryDiff).toEqual({
        path: ["Tokens", "brand", "secondary"],
        dotPath: "Tokens.brand.secondary",
        type: "added",
        figmaVal: "#ff0000",
        gitVal: ""
      });

      // 4. Submit proposal — goes through submitProposal (merge into git, not raw replace)
      mockRequest
        // mock getLatestCommitSha for createBranch
        .mockResolvedValueOnce({ data: { object: { sha: "parent-commit-sha" } } })
        // mock createBranch ref
        .mockResolvedValueOnce({ data: {} })
        // mock getFile (inside submit to get current SHA)
        .mockResolvedValueOnce({ data: { type: "file", content: btoa(JSON.stringify(gitTokens)), sha: "base-sha" } })
        // mock updateFile PUT repo contents
        .mockResolvedValueOnce({ data: { commit: { sha: "new-commit-sha" } } })
        // mock createPullRequest POST pulls
        .mockResolvedValueOnce({ data: { number: 99, html_url: "https://github.com/pull/99" } });

      const pr = await submitProposal(config, github, figmaJson, diffs, "Update variables", null);

      // Verify PR creation output
      expect(pr).toEqual({
        number: 99,
        html_url: "https://github.com/pull/99",
        head_ref: expect.any(String),
        gitContent: expect.any(String),
      });

      // Verify the PUT content is the merged tree (here equivalent to the full export,
      // since git had nothing this fixture's Figma state doesn't also produce).
      const putCall = mockRequest.mock.calls.find(([endpoint]) => endpoint === "PUT /repos/{owner}/{repo}/contents/{path}");
      expect(putCall![1]).toMatchObject({
        owner: "owner",
        repo: "repo",
        path: "tokens.json",
        message: "Update variables",
        sha: "base-sha"
      });
      const writtenContent = JSON.parse(atob(putCall![1].content));
      expect(writtenContent).toEqual(JSON.parse(figmaJson));
    });

    it("preserves an invalid/quarantined subtree the exporter doesn't produce, untouched, through a submit", async () => {
      const gitTokens = {
        Tokens: { brand: { primary: { $type: "color", $value: "#ffffff" } } },
        // Not a valid token (has $value AND a non-"$" child) — quarantined, excluded from diffs.
        Notes: { readme: { $value: "hand-authored", weird: {} } }
      };
      mockRequest.mockResolvedValueOnce({
        data: { type: "file", content: btoa(JSON.stringify(gitTokens)), sha: "base-sha" }
      });

      const { figmaMock } = createMockFigma();
      const col = figmaMock.variables.createVariableCollection("Tokens");
      const primaryVar = figmaMock.variables.createVariable("brand/primary", col.id, "COLOR");
      primaryVar.setValueForMode(col.modes[0].modeId, { r: 0, g: 0, b: 0 }); // modified to #000000

      const fileData = await github.getFile(config);
      const gitJson = fileData?.content ?? "{}";
      const figmaJson = exportToDtcg(
        figmaMock.variables.getLocalVariableCollections(),
        figmaMock.variables.getLocalVariables(),
        figmaMock
      );
      const { diffs } = computeDiff(figmaJson, gitJson, "proposals");
      expect(diffs).toHaveLength(1);

      mockRequest
        .mockResolvedValueOnce({ data: { object: { sha: "parent-commit-sha" } } })
        .mockResolvedValueOnce({ data: {} })
        .mockResolvedValueOnce({ data: { type: "file", content: btoa(JSON.stringify(gitTokens)), sha: "base-sha" } })
        .mockResolvedValueOnce({ data: { commit: { sha: "new-commit-sha" } } })
        .mockResolvedValueOnce({ data: { number: 100, html_url: "https://github.com/pull/100" } });

      await submitProposal(config, github, figmaJson, diffs, "Update primary", null);

      const putCall = mockRequest.mock.calls.find(([endpoint]) => endpoint === "PUT /repos/{owner}/{repo}/contents/{path}");
      const writtenContent = JSON.parse(atob(putCall![1].content));
      expect(writtenContent.Notes).toEqual({ readme: { $value: "hand-authored", weird: {} } });
      expect(writtenContent.Tokens.brand.primary.$value).toBe("#000000");
    });

    it("removes only the token deleted in Figma, leaving the rest of git's content intact", async () => {
      const gitTokens = {
        Tokens: {
          brand: {
            primary: { $type: "color", $value: "#ffffff" },
            secondary: { $type: "color", $value: "#ff0000" }
          }
        }
      };
      mockRequest.mockResolvedValueOnce({
        data: { type: "file", content: btoa(JSON.stringify(gitTokens)), sha: "base-sha" }
      });

      // Figma only has "primary" now — "secondary" was deleted from the design file.
      const { figmaMock } = createMockFigma();
      const col = figmaMock.variables.createVariableCollection("Tokens");
      const primaryVar = figmaMock.variables.createVariable("brand/primary", col.id, "COLOR");
      primaryVar.setValueForMode(col.modes[0].modeId, { r: 1, g: 1, b: 1 });

      const fileData = await github.getFile(config);
      const gitJson = fileData?.content ?? "{}";
      const figmaJson = exportToDtcg(
        figmaMock.variables.getLocalVariableCollections(),
        figmaMock.variables.getLocalVariables(),
        figmaMock
      );
      const { diffs } = computeDiff(figmaJson, gitJson, "proposals");
      expect(diffs).toEqual([
        { path: ["Tokens", "brand", "secondary"], dotPath: "Tokens.brand.secondary", type: "deleted", figmaVal: "", gitVal: "#ff0000" }
      ]);

      mockRequest
        .mockResolvedValueOnce({ data: { object: { sha: "parent-commit-sha" } } })
        .mockResolvedValueOnce({ data: {} })
        .mockResolvedValueOnce({ data: { type: "file", content: btoa(JSON.stringify(gitTokens)), sha: "base-sha" } })
        .mockResolvedValueOnce({ data: { commit: { sha: "new-commit-sha" } } })
        .mockResolvedValueOnce({ data: { number: 101, html_url: "https://github.com/pull/101" } });

      await submitProposal(config, github, figmaJson, diffs, "Remove secondary", null);

      const putCall = mockRequest.mock.calls.find(([endpoint]) => endpoint === "PUT /repos/{owner}/{repo}/contents/{path}");
      const writtenContent = JSON.parse(atob(putCall![1].content));
      expect(writtenContent).toEqual({
        $modes: { "Mode-1": {} },
        Tokens: { brand: { primary: { $type: "color", $value: "#ffffff" } } }
      });
    });
  });

  describe("Settings and Edge Cases", () => {
    it("should handle 404 (file missing) in updates flow gracefully", async () => {
      // Mock GitHub getFile returning 404
      const error: any = new Error("Not Found");
      error.status = 404;
      mockRequest.mockRejectedValueOnce(error);

      const fileData = await github.getFile(config);
      expect(fileData).toBeNull();

      const checkUpdateLogic = async () => {
        if (!fileData) {
          throw new Error(
            `Token file not found at ${config.filePath} on branch "${config.branch}". Push the file to GitHub first.`
          );
        }
      };

      await expect(checkUpdateLogic()).rejects.toThrow(
        `Token file not found at tokens.json on branch "main". Push the file to GitHub first.`
      );
    });

    it("should handle empty repo/missing file in proposals flow by comparing against empty JSON", async () => {
      // Mock GitHub getFile returning 404
      const error: any = new Error("Not Found");
      error.status = 404;
      mockRequest.mockRejectedValueOnce(error);

      const fileData = await github.getFile(config);
      expect(fileData).toBeNull();

      const gitJson = fileData?.content ?? "{}";
      expect(gitJson).toBe("{}");

      // Setup Figma variables
      const { figmaMock } = createMockFigma();
      const col = figmaMock.variables.createVariableCollection("Tokens");
      const primaryVar = figmaMock.variables.createVariable("brand/primary", col.id, "COLOR");
      primaryVar.setValueForMode(col.modes[0].modeId, { r: 1, g: 1, b: 1 });

      const figmaJson = exportToDtcg(
        figmaMock.variables.getLocalVariableCollections(),
        figmaMock.variables.getLocalVariables(),
        figmaMock
      );

      const { diffs } = computeDiff(figmaJson, gitJson, "proposals");

      // All variables in Figma are detected as "added"
      expect(diffs).toHaveLength(1);
      expect(diffs[0].type).toBe("added");
    });
  });

  describe("Diff Base Switching (safe subset)", () => {
    function setupLoadOfVariables() {
      const { figmaMock } = createMockFigma();
      const colors = figmaMock.variables.createVariableCollection("Colors");
      const primary = figmaMock.variables.createVariable("primary", colors.id, "COLOR");
      primary.setValueForMode(colors.modes[0].modeId, { r: 1, g: 0, b: 0 });
      const secondary = figmaMock.variables.createVariable("secondary", colors.id, "COLOR");
      secondary.setValueForMode(colors.modes[0].modeId, { r: 0, g: 1, b: 0 });
      const tertiary = figmaMock.variables.createVariable("tertiary", colors.id, "COLOR");
      tertiary.setValueForMode(colors.modes[0].modeId, { r: 0, g: 0, b: 1 });

      const spacing = figmaMock.variables.createVariableCollection("Spacing");
      const small = figmaMock.variables.createVariable("small", spacing.id, "COLOR");
      small.setValueForMode(spacing.modes[0].modeId, { r: 0.1, g: 0.1, b: 0.1 });
      const medium = figmaMock.variables.createVariable("medium", spacing.id, "COLOR");
      medium.setValueForMode(spacing.modes[0].modeId, { r: 0.2, g: 0.2, b: 0.2 });

      return { figmaMock };
    }

    function exportCurrent(figmaMock: any): string {
      return exportToDtcg(
        figmaMock.variables.getLocalVariableCollections(),
        figmaMock.variables.getLocalVariables(),
        figmaMock
      );
    }

    it("switching back to an empty base after proposing everything leaves Figma's variables untouched", async () => {
      const { figmaMock } = setupLoadOfVariables();
      connectFigmaMessagesTo(figmaMock);

      const fullFigmaJson = exportCurrent(figmaMock);
      // Proposing "everything" means the PR branch's content is a full copy of Figma's export.
      const proposalBranchContent = fullFigmaJson;

      const safeDotPaths = await computeSafeSubset(proposalBranchContent, "{}");
      // The empty-target guard short-circuits before any per-path diffing — an empty git target
      // is never something to sync toward, regardless of what it's a delta from.
      expect(safeDotPaths.size).toBe(0);

      const refreshed = await applySafeSubset("{}", safeDotPaths, config);

      expect(figmaMock.variables.getLocalVariables()).toHaveLength(5);
      expect(figmaMock.variables.getLocalVariableCollections()).toHaveLength(2);

      // The diff list reflects that reality — all 5 immediately reappear as "added" again.
      expect(refreshed.diffs).toHaveLength(5);
      expect(refreshed.diffs.every((d) => d.type === "added")).toBe(true);
    });

    it("switching back to an empty base after proposing a subset still leaves Figma's variables untouched", async () => {
      const { figmaMock } = setupLoadOfVariables();
      connectFigmaMessagesTo(figmaMock);

      const fullFigmaJson = exportCurrent(figmaMock);
      const stagedDotPaths = new Set(["Colors.primary", "Colors.secondary"]);
      const proposalBranchContent = applyStagedDiffs("{}", fullFigmaJson, stagedDotPaths);

      const safeDotPaths = await computeSafeSubset(proposalBranchContent, "{}");
      expect(safeDotPaths.size).toBe(0);

      const refreshed = await applySafeSubset("{}", safeDotPaths, config);

      expect(figmaMock.variables.getLocalVariables()).toHaveLength(5);
      expect(figmaMock.variables.getLocalVariableCollections()).toHaveLength(2);

      expect(refreshed.diffs).toHaveLength(5);
      expect(refreshed.diffs.every((d) => d.type === "added")).toBe(true);
    });
  });
});
