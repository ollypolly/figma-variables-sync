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

function loadMultiModeTokenFile() {
  const tokenPath = resolve(
    __dirname,
    "../../../test-kit/tokens/design-tokens.json"
  );
  return readFileSync(tokenPath, "utf-8");
}

describe("Multi-mode and edge cases round-trip", () => {
  it("should round-trip multi-mode tokens, zero values, long floats, and aliases", () => {
    const collections: any[] = [
      {
        id: "col-tokens",
        name: "Tokens",
        modes: [
          { modeId: "mode-light", name: "Light" },
          { modeId: "mode-dark", name: "Dark" }
        ]
      }
    ];

    const variables: any[] = [
      {
        id: "var-brand-primary",
        name: "brand/primary",
        variableCollectionId: "col-tokens",
        resolvedType: "COLOR",
        scopes: ["FRAME_FILL", "SHAPE_FILL"],
        valuesByMode: {
          "mode-light": { r: 2/255, g: 132/255, b: 199/255, a: 1 },
          "mode-dark": { r: 56/255, g: 189/255, b: 248/255, a: 1 }
        }
      },
      {
        id: "var-brand-secondary",
        name: "brand/secondary",
        variableCollectionId: "col-tokens",
        resolvedType: "COLOR",
        scopes: ["FRAME_FILL", "SHAPE_FILL"],
        valuesByMode: {
          "mode-light": { r: 79/255, g: 70/255, b: 229/255, a: 1 },
          "mode-dark": { r: 129/255, g: 140/255, b: 248/255, a: 1 }
        }
      },
      {
        id: "var-surface-background",
        name: "surface/background",
        variableCollectionId: "col-tokens",
        resolvedType: "COLOR",
        scopes: ["FRAME_FILL", "SHAPE_FILL"],
        valuesByMode: {
          "mode-light": { r: 1, g: 1, b: 1, a: 1 },
          "mode-dark": { r: 15/255, g: 23/255, b: 42/255, a: 1 }
        }
      },
      {
        id: "var-surface-foreground",
        name: "surface/foreground",
        variableCollectionId: "col-tokens",
        resolvedType: "COLOR",
        scopes: ["TEXT_FILL"],
        valuesByMode: {
          "mode-light": { r: 15/255, g: 23/255, b: 42/255, a: 1 },
          "mode-dark": { r: 248/255, g: 250/255, b: 252/255, a: 1 }
        }
      },
      {
        id: "var-spacing-small",
        name: "spacing/small",
        variableCollectionId: "col-tokens",
        resolvedType: "FLOAT",
        scopes: ["GAP"],
        valuesByMode: {
          "mode-light": 8,
          "mode-dark": 8
        }
      },
      {
        id: "var-spacing-medium",
        name: "spacing/medium",
        variableCollectionId: "col-tokens",
        resolvedType: "FLOAT",
        scopes: ["GAP"],
        valuesByMode: {
          "mode-light": 16,
          "mode-dark": 16
        }
      },
      {
        id: "var-spacing-large",
        name: "spacing/large",
        variableCollectionId: "col-tokens",
        resolvedType: "FLOAT",
        scopes: ["GAP"],
        valuesByMode: {
          "mode-light": 24,
          "mode-dark": 24
        }
      },
      {
        id: "var-radius-small",
        name: "radius/small",
        variableCollectionId: "col-tokens",
        resolvedType: "FLOAT",
        scopes: ["CORNER_RADIUS"],
        valuesByMode: {
          "mode-light": 4,
          "mode-dark": 4
        }
      },
      {
        id: "var-radius-full",
        name: "radius/full",
        variableCollectionId: "col-tokens",
        resolvedType: "FLOAT",
        scopes: ["CORNER_RADIUS"],
        valuesByMode: {
          "mode-light": 9999,
          "mode-dark": 9999
        }
      },
      {
        id: "var-font-size-body",
        name: "font/size/body",
        variableCollectionId: "col-tokens",
        resolvedType: "FLOAT",
        scopes: ["FONT_SIZE"],
        valuesByMode: {
          "mode-light": 16,
          "mode-dark": 16
        }
      },
      {
        id: "var-font-weight-bold",
        name: "font/weight/bold",
        variableCollectionId: "col-tokens",
        resolvedType: "STRING",
        scopes: ["ALL_SCOPES"],
        valuesByMode: {
          "mode-light": "bold",
          "mode-dark": "bold"
        }
      },
      {
        id: "var-spacing-zero",
        name: "spacing/zero",
        variableCollectionId: "col-tokens",
        resolvedType: "FLOAT",
        scopes: ["GAP"],
        valuesByMode: {
          "mode-light": 0,
          "mode-dark": 0
        }
      },
      {
        id: "var-opacity-semi",
        name: "opacity/semi",
        variableCollectionId: "col-tokens",
        resolvedType: "FLOAT",
        scopes: [],
        valuesByMode: {
          "mode-light": 0.123456789,
          "mode-dark": 0.123456789
        }
      },
      {
        id: "var-brand-primary-alias",
        name: "brand/primary-alias",
        variableCollectionId: "col-tokens",
        resolvedType: "COLOR",
        scopes: ["FRAME_FILL"],
        valuesByMode: {
          "mode-light": { type: "VARIABLE_ALIAS", id: "var-brand-primary" },
          "mode-dark": { type: "VARIABLE_ALIAS", id: "var-brand-primary" }
        }
      }
    ];

    const figmaJson = exportToDtcg(collections, variables);
    const parsedFigma = parseDtcg(figmaJson);

    const zeroToken = parsedFigma.tokens.find(t => t.path.join(".") === "Tokens.spacing.zero");
    expect(zeroToken).toBeDefined();
    expect(zeroToken?.value).toBe("0px");

    const opacityToken = parsedFigma.tokens.find(t => t.path.join(".") === "Tokens.opacity.semi");
    expect(opacityToken).toBeDefined();
    expect(opacityToken?.value).toBe(0.123456789);

    const aliasToken = parsedFigma.tokens.find(t => t.path.join(".") === "Tokens.brand.primary-alias");
    expect(aliasToken).toBeDefined();
    expect(aliasToken?.value).toBe("{Tokens.brand.primary}");

    const gitJson = loadMultiModeTokenFile();
    const gitTokens = parseDtcg(gitJson).tokens;
    const gitMap = new Map(gitTokens.map(t => [t.path.join("."), t]));
    const figmaMap = new Map(parsedFigma.tokens.map(t => [t.path.join("."), t]));

    for (const [key, gitToken] of gitMap) {
      const figmaToken = figmaMap.get(key);
      expect(figmaToken).toBeDefined();
      expect(formatTokenVal(figmaToken!)).toEqual(formatTokenVal(gitToken));
    }
  });
});
