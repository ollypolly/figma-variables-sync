import { describe, it, expect } from "vitest";
import { buildDiffTree } from "./diffTree";
import type { DiffItem } from "./diff";

function makeItem(dotPath: string, type: DiffItem["type"] = "modified"): DiffItem {
  return {
    path: dotPath.split("."),
    dotPath,
    type,
    figmaVal: "new",
    gitVal: "old",
  };
}

describe("buildDiffTree", () => {
  it("nests every path segment as its own group", () => {
    const tree = buildDiffTree([makeItem("color.brand.primary")]);

    expect(tree).toEqual([
      {
        type: "group",
        name: "color",
        dotPath: "color",
        children: [
          {
            type: "group",
            name: "brand",
            dotPath: "color.brand",
            children: [
              {
                type: "leaf",
                name: "primary",
                dotPath: "color.brand.primary",
                item: makeItem("color.brand.primary"),
              },
            ],
          },
        ],
      },
    ]);
  });

  it("groups siblings under a shared parent instead of duplicating it", () => {
    const tree = buildDiffTree([
      makeItem("color.brand.primary"),
      makeItem("color.brand.secondary"),
    ]);

    expect(tree).toHaveLength(1);
    const colorGroup = tree[0];
    if (colorGroup.type !== "group") throw new Error("expected group");
    expect(colorGroup.children).toHaveLength(1);

    const brandGroup = colorGroup.children[0];
    if (brandGroup.type !== "group") throw new Error("expected group");
    expect(brandGroup.children).toHaveLength(2);
    expect(brandGroup.children.map((c) => c.name)).toEqual(["primary", "secondary"]);
  });

  it("treats a single-segment path as a top-level leaf with no group", () => {
    const tree = buildDiffTree([makeItem("spacing")]);

    expect(tree).toEqual([
      { type: "leaf", name: "spacing", dotPath: "spacing", item: makeItem("spacing") },
    ]);
  });

  it("keeps separate top-level groups distinct", () => {
    const tree = buildDiffTree([
      makeItem("color.brand.primary"),
      makeItem("spacing.small"),
    ]);

    expect(tree).toHaveLength(2);
    expect(tree.map((n) => n.name).sort()).toEqual(["color", "spacing"]);
  });
});
