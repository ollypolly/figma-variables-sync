import { describe, it, expect } from "vitest";
import { parseDtcg } from "./parseDtcg";

describe("parseDtcg", () => {
  it("flags a token whose alias reference doesn't resolve to any token in the file, without quarantining it", () => {
    const dtcg = {
      Tokens: {
        colors: {
          primary: { $type: "color", $value: "#ffffff" },
          warning: { $type: "color", $value: "{Semantic.Colours.Status.Warning}" },
        },
      },
    };

    const result = parseDtcg(JSON.stringify(dtcg));

    expect(result.unresolvedAliases).toEqual(["Tokens.colors.warning"]);
    expect(result.quarantined).toEqual([]);
    expect(result.tokens.map((t) => t.path.join("."))).toContain("Tokens.colors.warning");
  });

  it("does not flag an alias reference that resolves to a real token", () => {
    const dtcg = {
      Tokens: {
        colors: {
          primary: { $type: "color", $value: "#ffffff" },
          surface: { $type: "color", $value: "{Tokens.colors.primary}" },
        },
      },
    };

    const result = parseDtcg(JSON.stringify(dtcg));

    expect(result.unresolvedAliases).toEqual([]);
  });

  it("flags a dangling reference inside $modes as well as the default $value", () => {
    const dtcg = {
      Tokens: {
        colors: {
          primary: { $type: "color", $value: "#ffffff" },
          surface: {
            $type: "color",
            $value: "{Tokens.colors.primary}",
            $modes: { Dark: "{Semantic.Colours.Status.Warning}" },
          },
        },
      },
    };

    const result = parseDtcg(JSON.stringify(dtcg));

    expect(result.unresolvedAliases).toEqual(["Tokens.colors.surface"]);
  });
});
