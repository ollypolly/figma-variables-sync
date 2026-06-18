import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { exportToDtcg } from "./exporter/exportToDtcg";
import { parseDtcg } from "./parser/parseDtcg";
import { ParsedToken } from "./types";

function formatTokenVal(t: ParsedToken): string {
  let str = String(t.value);
  if (t.modes) {
    const modeStr = Object.entries(t.modes)
      .map(([m, v]) => `${m}: ${v}`)
      .join(", ");
    if (modeStr) {
      str = `${str} (${modeStr})`;
    }
  }
  return str;
}

function loadSnapshot() {
  const snapshotPath = resolve(
    __dirname,
    "../../../test-kit/figma/figma-variable-snapshot.json"
  );
  return JSON.parse(readFileSync(snapshotPath, "utf-8"));
}

function loadTokenFile() {
  const tokenPath = resolve(
    __dirname,
    "../../../test-kit/tokens/design-tokens-single-mode.json"
  );
  return readFileSync(tokenPath, "utf-8");
}

describe("Figma snapshot → export → diff against Git tokens", () => {
  it("should produce zero diffs when Git token file is present", () => {
    const snapshot = loadSnapshot();
    const gitJson = loadTokenFile();
    const figmaJson = exportToDtcg(snapshot.collections, snapshot.variables);

    const figmaTokens = parseDtcg(figmaJson).tokens;
    const gitTokens = parseDtcg(gitJson).tokens;

    const figmaMap = new Map(figmaTokens.map((t) => [t.path.join("."), t]));
    const gitMap = new Map(gitTokens.map((t) => [t.path.join("."), t]));

    const mismatches: string[] = [];

    for (const [key, gitToken] of gitMap) {
      const figmaToken = figmaMap.get(key);
      if (!figmaToken) {
        mismatches.push(`ADDED (in git, missing in figma): ${key}`);
        continue;
      }
      const figmaStr = formatTokenVal(figmaToken);
      const gitStr = formatTokenVal(gitToken);
      if (figmaStr !== gitStr) {
        mismatches.push(
          `MODIFIED ${key}: figma="${figmaStr}" git="${gitStr}"`
        );
      }
    }

    for (const [key] of figmaMap) {
      if (!gitMap.has(key)) {
        mismatches.push(`DELETED (in figma, missing in git): ${key}`);
      }
    }

    expect(mismatches).toEqual([]);
  });

  it("should show all tokens as deleted when Git file is missing (the 404 bug)", () => {
    const snapshot = loadSnapshot();
    const figmaJson = exportToDtcg(snapshot.collections, snapshot.variables);

    const figmaTokens = parseDtcg(figmaJson).tokens;
    const gitTokens = parseDtcg("{}").tokens;

    expect(figmaTokens.length).toBe(11);
    expect(gitTokens.length).toBe(0);
  });
});
