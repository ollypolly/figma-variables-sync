import { describe, it, expect } from "vitest";
import { computeDiff } from "./diff";

describe("computeDiff", () => {
  const tokenA = JSON.stringify({
    Tokens: {
      brand: {
        primary: {
          "$type": "color",
          "$value": "#ffffff"
        }
      }
    }
  });

  const tokenB = JSON.stringify({
    Tokens: {
      brand: {
        primary: {
          "$type": "color",
          "$value": "#000000"
        }
      }
    }
  });

  const tokenMultiA = JSON.stringify({
    "$modes": { "Light": {}, "Dark": {} },
    Tokens: {
      brand: {
        primary: {
          "$type": "color",
          "$value": "#ffffff",
          "$modes": { "Dark": "#000000" }
        }
      }
    }
  });

  const tokenMultiB = JSON.stringify({
    "$modes": { "Light": {}, "Dark": {} },
    Tokens: {
      brand: {
        primary: {
          "$type": "color",
          "$value": "#ffffff",
          "$modes": { "Dark": "#111111" }
        }
      }
    }
  });

  describe("Matching Tokens", () => {
    it("should return empty diff when figma and git tokens match", () => {
      const diffProposals = computeDiff(tokenA, tokenA, "proposals");
      const diffUpdates = computeDiff(tokenA, tokenA, "updates");

      expect(diffProposals).toEqual([]);
      expect(diffUpdates).toEqual([]);
    });
  });

  describe("Modified Tokens", () => {
    it("should detect modified values in proposals mode", () => {
      // Figma has B (new value #000000), Git has A (old value #ffffff)
      const diffs = computeDiff(tokenB, tokenA, "proposals");
      expect(diffs).toHaveLength(1);
      expect(diffs[0]).toEqual({
        path: ["Tokens", "brand", "primary"],
        dotPath: "Tokens.brand.primary",
        type: "modified",
        figmaVal: "#000000",
        gitVal: "#ffffff",
      });
    });

    it("should detect modified values in updates mode", () => {
      // Figma has A (old value #ffffff), Git has B (new value #000000)
      const diffs = computeDiff(tokenA, tokenB, "updates");
      expect(diffs).toHaveLength(1);
      expect(diffs[0]).toEqual({
        path: ["Tokens", "brand", "primary"],
        dotPath: "Tokens.brand.primary",
        type: "modified",
        figmaVal: "#ffffff",
        gitVal: "#000000",
      });
    });
  });

  describe("Added & Deleted Tokens", () => {
    const tokenWithTwo = JSON.stringify({
      Tokens: {
        brand: {
          primary: { "$type": "color", "$value": "#ffffff" },
          secondary: { "$type": "color", "$value": "#ff0000" }
        }
      }
    });

    it("should detect additions in proposals mode", () => {
      // Figma has two tokens, Git has only one. secondary is added.
      const diffs = computeDiff(tokenWithTwo, tokenA, "proposals");
      expect(diffs).toHaveLength(1);
      expect(diffs[0]).toEqual({
        path: ["Tokens", "brand", "secondary"],
        dotPath: "Tokens.brand.secondary",
        type: "added",
        figmaVal: "#ff0000",
        gitVal: "",
      });
    });

    it("should detect deletions in proposals mode", () => {
      // Figma has only primary, Git has both. secondary is deleted in Figma.
      const diffs = computeDiff(tokenA, tokenWithTwo, "proposals");
      expect(diffs).toHaveLength(1);
      expect(diffs[0]).toEqual({
        path: ["Tokens", "brand", "secondary"],
        dotPath: "Tokens.brand.secondary",
        type: "deleted",
        figmaVal: "",
        gitVal: "#ff0000",
      });
    });

    it("should detect additions in updates mode", () => {
      // Figma has one token, Git has both. secondary is added in Git.
      const diffs = computeDiff(tokenA, tokenWithTwo, "updates");
      expect(diffs).toHaveLength(1);
      expect(diffs[0]).toEqual({
        path: ["Tokens", "brand", "secondary"],
        dotPath: "Tokens.brand.secondary",
        type: "added",
        figmaVal: "",
        gitVal: "#ff0000",
      });
    });

    it("should detect deletions in updates mode", () => {
      // Figma has both, Git has only one. secondary is deleted in Git.
      const diffs = computeDiff(tokenWithTwo, tokenA, "updates");
      expect(diffs).toHaveLength(1);
      expect(diffs[0]).toEqual({
        path: ["Tokens", "brand", "secondary"],
        dotPath: "Tokens.brand.secondary",
        type: "deleted",
        figmaVal: "#ff0000",
        gitVal: "",
      });
    });
  });

  describe("Multi-mode Tokens", () => {
    it("should detect mode value differences", () => {
      const diffs = computeDiff(tokenMultiB, tokenMultiA, "proposals");
      expect(diffs).toHaveLength(1);
      expect(diffs[0]).toEqual({
        path: ["Tokens", "brand", "primary"],
        dotPath: "Tokens.brand.primary",
        type: "modified",
        figmaVal: "#ffffff (Dark: #111111)",
        gitVal: "#ffffff (Dark: #000000)",
      });
    });
  });

  describe("Empty/404 Git JSON Scenario", () => {
    it("should mark everything as deleted in updates mode if git is empty", () => {
      const diffs = computeDiff(tokenA, "{}", "updates");
      expect(diffs).toHaveLength(1);
      expect(diffs[0]).toEqual({
        path: ["Tokens", "brand", "primary"],
        dotPath: "Tokens.brand.primary",
        type: "deleted",
        figmaVal: "#ffffff",
        gitVal: "",
      });
    });

    it("should mark everything as added in proposals mode if git is empty", () => {
      const diffs = computeDiff(tokenA, "{}", "proposals");
      expect(diffs).toHaveLength(1);
      expect(diffs[0]).toEqual({
        path: ["Tokens", "brand", "primary"],
        dotPath: "Tokens.brand.primary",
        type: "added",
        figmaVal: "#ffffff",
        gitVal: "",
      });
    });
  });
});
