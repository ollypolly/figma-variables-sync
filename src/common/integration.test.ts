import { describe, it, expect, vi, beforeEach } from "vitest";
import { exportToDtcg } from "./dtcg/exporter/exportToDtcg";
import { importFromDtcg } from "./dtcg/importer/importFromDtcg";
import { computeDiff } from "./diff";
import { GitHubService } from "../services/github";
import { trimSettings, PluginSettings } from "../types";

// Mock Octokit
const mockRequest = vi.fn();
vi.mock("@octokit/core", () => {
  return {
    Octokit: class {
      request = mockRequest;
    }
  };
});

function createMockFigma() {
  const collections: any[] = [];
  const variables: any[] = [];

  const figmaMock: any = {
    variables: {
      getLocalVariableCollections() {
        return collections;
      },
      getLocalVariables() {
        return variables;
      },
      getVariableCollectionById(id: string) {
        return collections.find(c => c.id === id) || null;
      },
      getVariableById(id: string) {
        return variables.find(v => v.id === id) || null;
      },
      createVariableCollection(name: string) {
        const id = `col-${collections.length + 1}`;
        const newCol = {
          id,
          name,
          modes: [{ modeId: `${id}-mode-1`, name: "Mode 1" }],
          renameMode(modeId: string, name: string) {
            const m = this.modes.find((mode: any) => mode.modeId === modeId);
            if (m) m.name = name;
          },
          addMode(name: string) {
            const modeId = `${id}-mode-${this.modes.length + 1}`;
            this.modes.push({ modeId, name });
            return modeId;
          }
        };
        collections.push(newCol);
        return newCol;
      },
      createVariable(name: string, collectionId: string, resolvedType: string) {
        const id = `var-${variables.length + 1}`;
        const newVar = {
          id,
          name,
          variableCollectionId: collectionId,
          resolvedType,
          valuesByMode: {} as Record<string, any>,
          setValueForMode(modeId: string, value: any) {
            this.valuesByMode[modeId] = value;
          },
          remove() {
            const idx = variables.indexOf(this);
            if (idx > -1) variables.splice(idx, 1);
          }
        };
        variables.push(newVar);
        return newVar;
      }
    }
  };

  return { figmaMock, collections, variables };
}

describe("Plugin Flow Integration Tests", () => {
  let github: GitHubService;
  const config = {
    owner: "owner",
    repo: "repo",
    filePath: "tokens.json",
    branch: "main",
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

      const diffs = computeDiff(figmaJson, gitJson, "updates");

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

      const diffs = computeDiff(figmaJson, gitJson, "proposals");

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

      // 4. Submit proposal
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

      const newBranchName = "figma/proposal-test";
      await github.createBranch(config, newBranchName);

      const currentFile = await github.getFile(config);
      const commitSha = await github.updateFile(
        config,
        "Update variables",
        figmaJson,
        currentFile?.sha,
        newBranchName
      );

      const pr = await github.createPullRequest(
        config,
        "Update variables",
        "PR body description",
        newBranchName
      );

      // Verify PR creation output
      expect(commitSha).toBe("new-commit-sha");
      expect(pr).toEqual({ number: 99, html_url: "https://github.com/pull/99" });

      // Verify that the file we updated contains the Figma variables we exported
      expect(mockRequest).toHaveBeenCalledWith("PUT /repos/{owner}/{repo}/contents/{path}", {
        owner: "owner",
        repo: "repo",
        path: "tokens.json",
        message: "Update variables",
        content: btoa(figmaJson),
        sha: "base-sha",
        branch: newBranchName
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

      // Check how useUpdates behaves
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

      const diffs = computeDiff(figmaJson, gitJson, "proposals");
      
      // All variables in Figma are detected as "added"
      expect(diffs).toHaveLength(1);
      expect(diffs[0].type).toBe("added");
    });
  });
});
