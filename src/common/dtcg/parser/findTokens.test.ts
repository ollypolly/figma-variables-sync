import { describe, it, expect } from "vitest";
import { findTokens } from "./findTokens";

describe("findTokens", () => {
  it("quarantines a node that has both $value and child tokens, instead of dropping the children", () => {
    const dtcg = {
      Primary: {
        $type: "color",
        $value: "#ffffff",
        Hover: {
          $type: "color",
          $value: "#eeeeee",
        },
      },
    };

    const result = findTokens(dtcg);

    expect(result.quarantined).toEqual(["Primary"]);
    expect(result.tokens).toEqual([]);
  });
});
